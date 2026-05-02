import { Injectable, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseMongoService } from '@wuselverse/crud-framework';
import { ReviewDocument } from './review.schema';
import { PlatformEventsService } from '../realtime/platform-events.service';
import { AgentsService } from '../agents/agents.service';
import { Review } from '@wuselverse/contracts';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Injectable()
export class ReviewsService extends BaseMongoService<ReviewDocument> {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    @InjectModel('Review') private reviewModel: Model<ReviewDocument>,
    private readonly platformEvents: PlatformEventsService,
    private readonly agentsService: AgentsService,
    @InjectConnection() private readonly connection: Connection
  ) {
    super(reviewModel);
  }

  override async create(createDto: Partial<ReviewDocument>) {
    // ========== ANTI-GAMING VALIDATIONS ==========
    await this.validateReviewIntegrity(createDto);

    const result = await super.create(createDto);

    if (result.success) {
      await this.syncAgentRating(String(createDto.to || ''));
      this.platformEvents.notifyReviewsChanged();
      this.platformEvents.notifyAgentsChanged();
    }

    return result;
  }

  /**
   * Comprehensive anti-gaming validation for reviews.
   * Prevents self-dealing, fake reviews, and reputation manipulation.
   */
  private async validateReviewIntegrity(createDto: Partial<ReviewDocument>): Promise<void> {
    const taskId = String(createDto.taskId || '');
    const reviewerId = String(createDto.from || '');
    const reviewedAgentId = String(createDto.to || '');

    this.logger.debug('[VALIDATION] Starting review integrity check', {
      taskId,
      reviewerId,
      reviewedAgentId,
    });

    if (!taskId || !reviewerId || !reviewedAgentId) {
      throw new BadRequestException('Review must include taskId, from (reviewer), and to (agent).');
    }

    // 1. Get the task
    const TaskModel = this.connection.model('Task');
    const task: any = await TaskModel.findById(taskId).lean().exec();

    if (!task) {
      throw new BadRequestException(`Task ${taskId} not found.`);
    }

    // 2. CRITICAL: Prevent self-dealing (task poster = agent owner)
    const agent = await this.agentsService.findById(reviewedAgentId);
    if (!agent.success || !agent.data) {
      throw new BadRequestException(`Agent ${reviewedAgentId} not found.`);
    }

    const agentOwner = String(agent.data.owner || '');
    const taskPoster = String(task.poster || '');

    this.logger.debug('[VALIDATION] Entity IDs', {
      agentOwner,
      taskPoster,
      reviewerId,
      comparison: { 
        ownerVsPoster: agentOwner === taskPoster,
        ownerVsReviewer: agentOwner === reviewerId,
        reviewerVsPoster: reviewerId === taskPoster,
      },
    });

    // Block if same person owns both task and agent
    if (agentOwner === taskPoster) {
      this.logger.warn('Blocked self-dealing review attempt', {
        taskId,
        taskPoster,
        agentOwner,
        reviewedAgentId,
      });
      throw new ForbiddenException(
        'Cannot review your own agent. Reviews must be from independent task posters to prevent reputation gaming.'
      );
    }

    // Also check if reviewer owns the agent being reviewed
    if (agentOwner === reviewerId) {
      this.logger.warn('Blocked owner self-review attempt', {
        taskId,
        reviewerId,
        agentOwner,
        reviewedAgentId,
      });
      throw new ForbiddenException(
        'Agent owners cannot review their own agents. This prevents reputation manipulation.'
      );
    }

    // DELEGATION PROTECTION: Prevent cross-agent gaming
    // If reviewer is an agent (not the task poster), verify they don't share the same owner
    this.logger.debug('[VALIDATION] Checking cross-agent gaming protection', {
      reviewerId,
      taskPoster,
      willCheckReviewerAgent: reviewerId !== taskPoster,
    });

    if (reviewerId !== taskPoster) {
      this.logger.debug('[VALIDATION] Reviewer is not task poster, looking up reviewer as agent', {
        reviewerId,
      });
      const reviewerAgent = await this.agentsService.findById(reviewerId);
      if (reviewerAgent.success && reviewerAgent.data) {
        const reviewerOwner = String(reviewerAgent.data.owner || '');
        if (reviewerOwner === agentOwner) {
          this.logger.warn('Blocked cross-agent gaming attempt', {
            taskId,
            reviewerId,
            reviewedAgentId,
            sharedOwner: reviewerOwner,
          });
          throw new ForbiddenException(
            'Cannot use one agent to review another agent you own. This prevents reputation manipulation through delegation schemes.'
          );
        }
      }
    }

    // 3. Verify reviewer has authority to review
    // Allow two cases:
    // a) Direct review: Reviewer is the task poster
    // b) Delegation review: Reviewer is the agent assigned to the parent task
    const isDirectReview = taskPoster === reviewerId;
    let isDelegationReview = false;

    if (!isDirectReview && task.parentTaskId) {
      const parentTask: any = await TaskModel.findById(task.parentTaskId).lean().exec();
      if (parentTask) {
        const parentAssignedAgent = String(parentTask.assignedAgent || '');
        isDelegationReview = parentAssignedAgent === reviewerId;
        
        if (isDelegationReview) {
          this.logger.log('Delegation review authorized', {
            taskId,
            parentTaskId: task.parentTaskId,
            reviewerId,
            role: 'delegating-agent',
          });
        }
      }
    }

    if (!isDirectReview && !isDelegationReview) {
      this.logger.warn('Review submitted by unauthorized party', {
        taskId,
        taskPoster,
        reviewerId,
        hasParentTask: !!task.parentTaskId,
      });
      throw new ForbiddenException(
        'Only the task poster or the delegating agent can review. This prevents unauthorized review submissions.'
      );
    }

    // 4. Require task to be completed and verified
    const taskStatus = String(task.status || '');
    const verificationStatus = String(task.outcome?.verificationStatus || 'unverified');

    if (taskStatus !== 'completed') {
      throw new BadRequestException(
        `Task must be completed before reviewing. Current status: ${taskStatus}. Please verify or dispute the delivery first.`
      );
    }

    if (verificationStatus !== 'verified') {
      throw new BadRequestException(
        `Task must be verified before reviewing. Current verification status: ${verificationStatus}.`
      );
    }

    // 5. Verify agent actually worked on this task
    const assignedAgent = String(task.assignedAgent || '');
    if (assignedAgent !== reviewedAgentId) {
      this.logger.warn('Review for wrong agent', {
        taskId,
        assignedAgent,
        reviewedAgentId,
      });
      throw new BadRequestException(
        `Agent ${reviewedAgentId} was not assigned to this task. Assigned agent: ${assignedAgent}`
      );
    }

    // 6. No rate limiting - machine-speed agent interactions require unlimited reviews
    // Gaming prevention is handled by weighted aggregation (see calculateWeightedRating)
    const taskBudget = Number(task.budget?.amount || 0);
    this.logger.debug('Review validation complete - will use weighted aggregation', {
      taskId,
      reviewerId,
      reviewedAgentId,
      taskValue: taskBudget,
    });

    this.logger.log('Review validation passed', {
      taskId,
      reviewerId,
      reviewedAgentId,
      taskPoster,
      agentOwner,
    });
  }

  /**
   * Calculate weighted rating for an agent using consumer aggregation.
   * 
   * Algorithm:
   * 1. Group reviews by consumer (task poster)
   * 2. Weight each review by task value (bid amount)
   * 3. Calculate weighted average per consumer
   * 4. Overall rating = average of all consumer-weighted ratings
   * 
   * This approach:
   * - Allows unlimited reviews at machine speed (no rate limiting)
   * - Weights by task complexity (higher value = more influence)
   * - Aggregates per consumer (prevents spam from low-value tasks)
   * - Prevents gaming while enabling high-throughput operations
   */
  private async calculateWeightedRating(agentId: string): Promise<number> {
    const reviews = await this.reviewModel
      .find({ to: agentId })
      .lean()
      .exec();

    if (reviews.length === 0) {
      return 0;
    }

    // Get task values for all reviews
    const TaskModel = this.connection.model('Task');
    const taskIds = reviews.map((r) => r.taskId);
    const tasks = await TaskModel.find({ _id: { $in: taskIds } })
      .select('_id budget')
      .lean()
      .exec();

    const taskValueMap = new Map<string, number>();
    for (const task of tasks) {
      const taskValue = task.budget?.amount || 0;
      taskValueMap.set(String(task._id), taskValue);
    }

    // Group reviews by consumer (task poster/reviewer)
    const consumerReviews = new Map<
      string,
      Array<{ rating: number; weight: number; taskId: string }>
    >();

    for (const review of reviews) {
      const consumerId = String(review.from);
      const taskId = String(review.taskId);
      const taskValue = taskValueMap.get(taskId) || 0;

      if (!consumerReviews.has(consumerId)) {
        consumerReviews.set(consumerId, []);
      }

      consumerReviews.get(consumerId)!.push({
        rating: review.rating,
        weight: Math.max(taskValue, 1), // Minimum weight of 1
        taskId,
      });
    }

    // Calculate weighted average for each consumer
    const consumerAverages: number[] = [];

    for (const [consumerId, reviews] of consumerReviews.entries()) {
      const totalWeight = reviews.reduce((sum, r) => sum + r.weight, 0);
      const weightedSum = reviews.reduce(
        (sum, r) => sum + r.rating * r.weight,
        0
      );
      const consumerAvg = weightedSum / totalWeight;

      consumerAverages.push(consumerAvg);

      this.logger.debug(
        `Consumer ${consumerId} weighted avg for agent ${agentId}: ${consumerAvg.toFixed(2)} (${reviews.length} reviews, total weight: $${totalWeight})`
      );
    }

    // Overall agent rating = average of all consumer-weighted ratings
    const overallRating =
      consumerAverages.reduce((sum, avg) => sum + avg, 0) /
      consumerAverages.length;

    this.logger.log(
      `Agent ${agentId} rating: ${overallRating.toFixed(2)} (from ${consumerAverages.length} unique consumers, ${reviews.length} total reviews)`
    );

    return Math.round(overallRating * 10) / 10; // Round to 1 decimal place
  }

  /**
   * Get all reviews for a specific agent
   */
  async findByAgent(agentId: string): Promise<Review[]> {
    const reviews = await this.reviewModel
      .find({ to: agentId })
      .sort({ timestamp: -1 })
      .lean()
      .exec();
    
    return reviews.map(review => this.toResponseObject(review));
  }

  /**
   * Get reviews submitted by a specific agent
   */
  async findByReviewer(reviewerId: string): Promise<Review[]> {
    const reviews = await this.reviewModel
      .find({ from: reviewerId })
      .sort({ timestamp: -1 })
      .lean()
      .exec();
    
    return reviews.map(review => this.toResponseObject(review));
  }

  /**
   * Get review for a specific task
   */
  async findByTask(taskId: string): Promise<Review | null> {
    const review = await this.reviewModel.findOne({ taskId }).lean().exec();
    return review ? this.toResponseObject(review) : null;
  }

  /**
   * Calculate average rating for an agent
   */
  async getAverageRating(agentId: string): Promise<number> {
    const result = await this.reviewModel.aggregate([
      { $match: { to: agentId } },
      { $group: { _id: null, averageRating: { $avg: '$rating' } } }
    ]);

    return result.length > 0 ? Math.round(result[0].averageRating * 10) / 10 : 0;
  }

  /**
   * Get rating distribution for an agent
   */
  async getRatingDistribution(agentId: string): Promise<Record<number, number>> {
    const result = await this.reviewModel.aggregate([
      { $match: { to: agentId } },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    result.forEach(item => {
      distribution[item._id] = item.count;
    });

    return distribution;
  }

  /**
   * Check if a review already exists for a task
   */
  async hasReviewForTask(taskId: string): Promise<boolean> {
    return this.exists({ taskId });
  }

  private async syncAgentRating(agentId: string): Promise<void> {
    if (!agentId) {
      return;
    }

    try {
      const [weightedRating, reviews, agentResponse] = await Promise.all([
        this.calculateWeightedRating(agentId),
        this.findByAgent(agentId),
        this.agentsService.findById(agentId),
      ]);

      if (!agentResponse.success || !agentResponse.data) {
        return;
      }

      const reputation = {
        ...(agentResponse.data.reputation || {}),
        reviews,
      };

      await this.agentsService.updateById(agentId, {
        rating: weightedRating > 0 ? weightedRating : null,
        reputation,
      } as any);
      
      this.logger.log(`Updated agent ${agentId} to weighted rating ${weightedRating}`);
    } catch (error) {
      this.logger.warn(`Failed to sync rating for agent ${agentId}: ${(error as Error).message}`);
    }
  }

  private toResponseObject(doc: any): Review {
    return {
      id: doc._id.toString(),
      from: doc.from,
      to: doc.to,
      taskId: doc.taskId,
      rating: doc.rating,
      comment: doc.comment,
      timestamp: doc.timestamp,
      verified: doc.verified
    };
  }
}
