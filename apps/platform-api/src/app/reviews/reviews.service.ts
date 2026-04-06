import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseMongoService } from '@wuselverse/crud-framework';
import { ReviewDocument } from './review.schema';
import { PlatformEventsService } from '../realtime/platform-events.service';
import { AgentsService } from '../agents/agents.service';
import { Review } from '@wuselverse/contracts';

@Injectable()
export class ReviewsService extends BaseMongoService<ReviewDocument> {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    @InjectModel('Review') private reviewModel: Model<ReviewDocument>,
    private readonly platformEvents: PlatformEventsService,
    private readonly agentsService: AgentsService
  ) {
    super(reviewModel);
  }

  override async create(createDto: Partial<ReviewDocument>) {
    const result = await super.create(createDto);

    if (result.success) {
      await this.syncAgentRating(String(createDto.to || ''));
      this.platformEvents.notifyReviewsChanged();
      this.platformEvents.notifyAgentsChanged();
    }

    return result;
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
      const [averageRating, reviews, agentResponse] = await Promise.all([
        this.getAverageRating(agentId),
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
        rating: averageRating > 0 ? averageRating : null,
        reputation,
      } as any);
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
