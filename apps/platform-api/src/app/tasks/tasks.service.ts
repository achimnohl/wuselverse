import { BadRequestException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseMongoService } from '@wuselverse/crud-framework';
import { TaskDocument } from './task.schema';
import { AgentsService } from '../agents/agents.service';
import { AgentMcpClientService } from '../agents/agent-mcp-client.service';
import { TransactionsService } from '../transactions/transactions.service';
import { PlatformEventsService } from '../realtime/platform-events.service';
import { TaskStatus, BidStatus, TransactionStatus, TransactionType, type Bid } from '@wuselverse/contracts';

@Injectable()
export class TasksService extends BaseMongoService<TaskDocument> {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @InjectModel('Task') private taskModel: Model<TaskDocument>,
    private agentsService: AgentsService,
    private agentMcpClient: AgentMcpClientService,
    private transactionsService: TransactionsService,
    private readonly platformEvents: PlatformEventsService
  ) {
    super(taskModel);
  }

  override async findAll(filter: any = {}, options: any = {}) {
    const result = await super.findAll(filter, options);

    if (!result.success || !result.data) {
      return result;
    }

    const decoratedTasks = await Promise.all(
      (result.data.data || []).map((task: any) => this.decorateTaskWithSettlementState(task))
    );

    return {
      ...result,
      data: {
        ...result.data,
        data: decoratedTasks as any,
      },
    };
  }

  override async findById(id: string) {
    const result = await super.findById(id);

    if (!result.success || !result.data) {
      return result;
    }

    return {
      ...result,
      data: (await this.decorateTaskWithSettlementState(result.data)) as any,
    };
  }

  /**
   * Override create to add default metadata if not provided
   */
  override async create(createDto: any) {
    this.logger.log('Creating new task', {
      title: createDto.title,
      poster: createDto.poster,
      capabilities: createDto.requirements?.capabilities || [],
      budget: createDto.budget
    });

    const taskData = {
      ...createDto,
      metadata: createDto.metadata || {},
      acceptanceCriteria: createDto.acceptanceCriteria || [],
      status: TaskStatus.OPEN,
      bids: [],
      childTaskIds: createDto.childTaskIds || [],
      reservedBudget: createDto.reservedBudget || 0,
      delegationDepth: createDto.delegationDepth ?? 0,
    };

    const result = await super.create(taskData);

    if (result.success && result.data) {
      let createdTask = result.data!;
      const createdTaskId = String(createdTask._id || createdTask.id || '');

      if (createdTaskId && !createdTask.rootTaskId) {
        await this.updateById(createdTaskId, {
          rootTaskId: createdTask.parentTaskId || createdTaskId,
          delegationDepth: createdTask.parentTaskId ? (createdTask.delegationDepth ?? 1) : 0,
          childTaskIds: createdTask.childTaskIds || [],
          reservedBudget: createdTask.reservedBudget || 0,
        } as any);

        const refreshedTask = await this.findById(createdTaskId);
        if (refreshedTask.success && refreshedTask.data) {
          createdTask = refreshedTask.data;
          result.data = refreshedTask.data as any;
        }
      }
      this.logger.log('Task created', {
        taskId: createdTask._id,
        status: createdTask.status
      });
      this.platformEvents.notifyTasksChanged();
      this.logger.debug('Requesting bids from matching agents');
      this.requestBidsFromMatchingAgents(createdTask).catch((error) => {
        this.logger.error(
          `Failed to auto-request bids for task ${createdTask._id}`,
          error
        );
      });
    } else {
      this.logger.error('Failed to create task', result.error);
    }

    return result;
  }

  /**
   * Post a new task (alias for create)
   */
  async postTask(task: any) {
    return this.create(task);
  }

  /**
   * Get task by ID (alias for findById)
   */
  async getTask(taskId: string) {
    return this.findById(taskId);
  }

  async findByParentId(parentTaskId: string) {
    const tasks = await this.taskModel
      .find({ parentTaskId })
      .sort({ createdAt: -1 })
      .exec();

    const decoratedTasks = await Promise.all(tasks.map((task) => this.decorateTaskWithSettlementState(task)));

    return {
      success: true,
      data: decoratedTasks,
    };
  }

  async getTaskChain(taskId: string) {
    const taskResponse = await this.findById(taskId);

    if (!taskResponse.success || !taskResponse.data) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }

    const task = taskResponse.data;
    const currentTaskId = String(task._id || task.id || taskId);
    const rootTaskId = String(task.rootTaskId || task.parentTaskId || currentTaskId);

    const [parentTask, children, lineage] = await Promise.all([
      task.parentTaskId ? this.findById(String(task.parentTaskId)) : Promise.resolve(null),
      this.taskModel.find({ parentTaskId: currentTaskId }).sort({ createdAt: 1 }).exec(),
      this.taskModel
        .find({
          $or: [
            { _id: rootTaskId },
            { rootTaskId },
          ],
        })
        .sort({ delegationDepth: 1, createdAt: 1 })
        .exec(),
    ]);

    const decoratedTask = await this.decorateTaskWithSettlementState(task);
    const decoratedParent = parentTask && parentTask.success ? await this.decorateTaskWithSettlementState(parentTask.data) : null;
    const decoratedChildren = await Promise.all(children.map((child) => this.decorateTaskWithSettlementState(child)));
    const decoratedLineage = await Promise.all(lineage.map((entry) => this.decorateTaskWithSettlementState(entry)));

    return {
      task: decoratedTask,
      parent: decoratedParent,
      children: decoratedChildren,
      lineage: decoratedLineage,
      rootTaskId,
      delegationDepth: Number((decoratedTask as any).delegationDepth ?? 0),
      reservedBudget: Number((decoratedTask as any).reservedBudget ?? 0),
      settlementStatus: (decoratedTask as any).settlementStatus,
      settlementHoldReason: (decoratedTask as any).settlementHoldReason,
      blockedByTaskId: (decoratedTask as any).blockedByTaskId,
      blockedByStatus: (decoratedTask as any).blockedByStatus,
      blockedByAgentId: (decoratedTask as any).blockedByAgentId,
    };
  }

  async createSubtask(parentTaskId: string, agentId: string, createDto: any) {
    const parentResponse = await this.findById(parentTaskId);

    if (!parentResponse.success || !parentResponse.data) {
      throw new NotFoundException(`Parent task ${parentTaskId} not found`);
    }

    const parentTask = parentResponse.data;

    if (parentTask.assignedAgent !== agentId) {
      throw new BadRequestException('Only the assigned agent can create a delegated subtask');
    }

    const blockingChildTasks = await this.findBlockingChildTasks(parentTask);
    const canRecoverFromBlockedReview =
      parentTask.status === TaskStatus.PENDING_REVIEW && blockingChildTasks.length > 0;

    if (
      ![TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS].includes(parentTask.status as TaskStatus) &&
      !canRecoverFromBlockedReview
    ) {
      throw new BadRequestException(
        'Parent task must be assigned, in progress, or blocked by delegated child settlement before creating subtasks'
      );
    }

    const requestedBudget = Number(createDto?.budget?.amount ?? 0);
    if (!Number.isFinite(requestedBudget) || requestedBudget <= 0) {
      throw new BadRequestException('Subtask budget must be greater than zero');
    }

    const parentCurrency = parentTask.budget?.currency || 'USD';
    if ((createDto?.budget?.currency || parentCurrency) !== parentCurrency) {
      throw new BadRequestException('Subtask currency must match the parent task currency');
    }

    const maxDelegationDepth = Number(process.env.MAX_DELEGATION_DEPTH ?? 3);
    const currentDepth = Number(parentTask.delegationDepth ?? 0);
    if (currentDepth >= maxDelegationDepth) {
      throw new BadRequestException(`Delegation depth limit (${maxDelegationDepth}) reached`);
    }

    const reservedBudget = Number(parentTask.reservedBudget ?? 0);
    const parentBudget = Number(parentTask.budget?.amount ?? 0);
    const remainingBudget = parentBudget - reservedBudget;

    if (requestedBudget > remainingBudget) {
      throw new BadRequestException(
        `Subtask budget ${requestedBudget} exceeds the remaining parent budget ${remainingBudget}`
      );
    }

    const rootTaskId = String(parentTask.rootTaskId || parentTask._id || parentTask.id || parentTaskId);
    const createResult = await this.create({
      ...createDto,
      poster: agentId,
      parentTaskId,
      rootTaskId,
      delegationDepth: currentDepth + 1,
      childTaskIds: [],
      reservedBudget: 0,
      metadata: {
        ...(createDto.metadata || {}),
        delegatedFromTaskId: parentTaskId,
        delegatedByAgentId: agentId,
        parentTaskPoster: parentTask.poster,
        remainingParentBudgetAfterReservation: remainingBudget - requestedBudget,
      },
    });

    if (!createResult.success || !createResult.data) {
      throw new BadRequestException(createResult.error || 'Failed to create delegated subtask');
    }

    const createdSubtaskId = String(createResult.data._id || createResult.data.id || '');
    const nextChildTaskIds = [...(parentTask.childTaskIds || []), createdSubtaskId];

    const parentUpdate = await this.updateById(parentTaskId, {
      childTaskIds: nextChildTaskIds,
      reservedBudget: reservedBudget + requestedBudget,
      rootTaskId,
    } as any);

    if (!parentUpdate.success) {
      throw new BadRequestException(parentUpdate.error || 'Failed to update parent task after creating subtask');
    }

    await Promise.all([
      this.appendSettlementAuditEvent(parentTaskId, {
        type: 'child_task_created',
        message: `Delegated child task ${createdSubtaskId} was created with a reserved budget of ${parentCurrency} ${requestedBudget.toFixed(2)}.`,
        actorId: agentId,
        relatedTaskId: createdSubtaskId,
        details: this.buildTaskChainMetadata(parentTask, {
          childTaskId: createdSubtaskId,
          reservedBudgetAfter: reservedBudget + requestedBudget,
          childBudget: requestedBudget,
        }),
      }),
      createdSubtaskId
        ? this.appendSettlementAuditEvent(createdSubtaskId, {
            type: 'created_from_parent',
            message: `Created as a delegated child of task ${parentTaskId}.`,
            actorId: agentId,
            relatedTaskId: parentTaskId,
            details: this.buildTaskChainMetadata(createResult.data, {
              parentTaskId,
            }),
          })
        : Promise.resolve(),
    ]);

    this.platformEvents.notifyTasksChanged();

    const refreshedSubtask = createdSubtaskId ? await this.findById(createdSubtaskId) : createResult;
    return refreshedSubtask.success ? refreshedSubtask : createResult;
  }

  /**
   * Submit a bid for a task
   */
  async submitBid(taskId: string, bid: Omit<Bid, 'id' | 'timestamp' | 'status'>) {
    this.logger.debug('Processing bid', { taskId, agentId: bid.agentId, amount: bid.amount });
    
    const taskResponse = await this.findById(taskId);
    
    if (!taskResponse.success || !taskResponse.data) {
      this.logger.debug('Task not found', { taskId });
      throw new NotFoundException(`Task ${taskId} not found`);
    }

    const task = taskResponse.data;

    if (task.status !== TaskStatus.OPEN) {
      this.logger.debug('Task not accepting bids', { taskId, status: task.status });
      throw new Error('Task is not accepting bids');
    }

    // Verify agent exists
    const agentResponse = await this.agentsService.findById(bid.agentId);
    if (!agentResponse.success || !agentResponse.data) {
      this.logger.debug('Agent not found', { agentId: bid.agentId });
      throw new Error('Agent not found');
    }

    const newBid: Bid = {
      ...bid,
      id: `bid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      status: BidStatus.PENDING
    };

    task.bids = task.bids || [];
    task.bids.push(newBid);

    this.logger.log('Bid added', { 
      taskId, 
      bidId: newBid.id, 
      totalBids: task.bids.length 
    });

    const result = await this.updateById(taskId, { bids: task.bids });

    if (result.success) {
      this.platformEvents.notifyTasksChanged();
    }

    return result;
  }

  /**
   * Accept a bid and assign task to agent
   */
  async acceptBid(taskId: string, bidId: string) {
    this.logger.log('Accepting bid', { taskId, bidId });
    
    const taskResponse = await this.findById(taskId);
    
    if (!taskResponse.success || !taskResponse.data) {
      this.logger.debug('Task not found', { taskId });
      throw new NotFoundException(`Task ${taskId} not found`);
    }

    const task = taskResponse.data;
    const bid = task.bids?.find((b: Bid) => b.id === bidId);

    if (!bid) {
      this.logger.debug('Bid not found', { taskId, bidId, totalBids: task.bids?.length || 0 });
      throw new NotFoundException(`Bid ${bidId} not found`);
    }

    if (task.status !== TaskStatus.OPEN) {
      this.logger.debug('Task not open', { taskId, status: task.status });
      throw new Error('Task is not open');
    }

    this.logger.log('Assigning task to agent', { 
      taskId, 
      agentId: bid.agentId, 
      amount: bid.amount 
    });

    // Update all bids: accepted one becomes ACCEPTED, others REJECTED
    task.bids = task.bids?.map((b: Bid) => ({
      ...b,
      status: b.id === bidId ? BidStatus.ACCEPTED : BidStatus.REJECTED
    }));

    const updateResult = await this.updateById(taskId, {
      status: TaskStatus.ASSIGNED,
      assignedAgent: bid.agentId,
      bids: task.bids
    });

    this.logger.log('Task assigned', { 
      taskId, 
      status: TaskStatus.ASSIGNED, 
      assignedAgent: bid.agentId 
    });

    if (updateResult.success) {
      this.platformEvents.notifyTasksChanged();

      try {
        await this.ensureTransactionRecorded({
          taskId,
          parentTaskId: task.parentTaskId ? String(task.parentTaskId) : undefined,
          rootTaskId: String(task.rootTaskId || task.parentTaskId || taskId),
          delegationDepth: Number(task.delegationDepth ?? 0),
          from: task.poster,
          to: this.getEscrowAccount(taskId),
          amount: bid.amount,
          currency: task.budget?.currency || 'USD',
          type: TransactionType.ESCROW_LOCK,
          status: TransactionStatus.COMPLETED,
          escrowId: this.getEscrowId(taskId),
          metadata: this.buildTaskChainMetadata(task, {
            bidId: bid.id,
            agentId: bid.agentId,
            budgetType: task.budget?.type,
            stage: 'assignment',
          }),
        });
      } catch (error) {
        this.logger.error(`Failed to record escrow transaction for task ${taskId}`, error as Error);
      }
    }

    try {
      const agentResponse = await this.agentsService.findById(bid.agentId);
      const agent = agentResponse.success ? agentResponse.data : null;

      if (agent?.mcpEndpoint && updateResult.success && updateResult.data) {
        this.logger.debug('Notifying agent via MCP', { 
          agentId: bid.agentId, 
          mcpEndpoint: agent.mcpEndpoint 
        });
        await this.agentMcpClient.assignTask(bid.agentId, agent.mcpEndpoint, {
          taskId,
          bidId,
          escrowTransactionId: `escrow_${taskId}`,
          details: updateResult.data,
        });
        this.logger.log('Agent notified successfully');
      } else {
        this.logger.debug('Skipping MCP notification', { 
          hasAgent: !!agent, 
          hasMcpEndpoint: !!agent?.mcpEndpoint 
        });
      }
    } catch (error) {
      this.logger.error(`Failed to notify assigned agent ${bid.agentId}`, error);
    }

    return updateResult;
  }

  /**
   * Find tasks with pagination (for MCP tools)
   */
  async findPaginated(query: any, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.taskModel.find(query).skip(skip).limit(limit).sort({ createdAt: -1 }).exec(),
      this.taskModel.countDocuments(query).exec(),
    ]);

    const decoratedItems = await Promise.all(items.map((task) => this.decorateTaskWithSettlementState(task)));

    return {
      items: decoratedItems,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Create a bid (for MCP tools)
   */
  async createBid(
    taskId: string,
    agentId: string,
    bidData: { amount: number; proposal: string; estimatedDuration?: number },
  ) {
    const bid: Omit<Bid, 'id' | 'timestamp' | 'status'> = {
      agentId,
      ...bidData,
    };

    const result = await this.submitBid(taskId, bid);
    
    if (!result.success || !result.data) {
      throw new Error('Failed to create bid');
    }

    // Return the newly created bid
    const createdBid = result.data.bids?.[result.data.bids.length - 1];
    return createdBid;
  }

  /**
   * Complete a task (for MCP tools)
   */
  async completeTask(
    taskId: string,
    agentId: string,
    resultData: {
      success: boolean;
      output: any;
      artifacts?: string[];
      metadata?: Record<string, any>;
    },
  ) {
    const taskResponse = await this.findById(taskId);

    if (!taskResponse.success || !taskResponse.data) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }

    const task = taskResponse.data;

    if (task.assignedAgent !== agentId) {
      throw new BadRequestException('Only the assigned agent can complete the task');
    }

    if (
      resultData.success &&
      (task.status === TaskStatus.PENDING_REVIEW || task.status === TaskStatus.COMPLETED) &&
      task.outcome
    ) {
      return {
        taskId,
        status: task.status,
        completedAt: task.completedAt || task.outcome.completedAt,
        verificationStatus: task.outcome.verificationStatus,
      };
    }

    if (task.status !== TaskStatus.ASSIGNED && task.status !== TaskStatus.IN_PROGRESS) {
      throw new BadRequestException('Task is not in a completable state');
    }

    const completedAt = new Date();
    const nextStatus = resultData.success ? TaskStatus.PENDING_REVIEW : TaskStatus.FAILED;
    const verificationStatus = resultData.success ? 'unverified' : 'disputed';

    const updateResult = await this.updateById(taskId, {
      status: nextStatus,
      completedAt,
      result: {
        ...resultData,
      },
      outcome: {
        success: resultData.success,
        result: resultData.output,
        artifacts: resultData.artifacts || [],
        verificationStatus,
        completedAt,
        feedback: resultData.success ? 'Awaiting task poster verification.' : 'Agent reported an unsuccessful completion.',
      },
    });

    if (!updateResult.success || !updateResult.data) {
      throw new Error('Failed to update task');
    }

    await this.appendSettlementAuditEvent(taskId, {
      type: resultData.success ? 'submitted_for_review' : 'reported_failed',
      message: resultData.success
        ? 'Delivery submitted for verification by the assigned agent.'
        : 'Assigned agent reported an unsuccessful completion attempt.',
      actorId: agentId,
      details: this.buildTaskChainMetadata(task, {
        artifactsCount: resultData.artifacts?.length || 0,
      }),
    });

    this.platformEvents.notifyTasksChanged();

    if (!resultData.success) {
      await this.recordSettlementOutcome(task, agentId, false, {
        outcome: 'failed',
        reason: 'agent_reported_failure',
      });
    }

    return {
      taskId,
      status: updateResult.data.status,
      completedAt,
      verificationStatus,
    };
  }

  async verifyTask(taskId: string, verifierId: string, feedback?: string) {
    const taskResponse = await this.findById(taskId);

    if (!taskResponse.success || !taskResponse.data) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }

    const task = taskResponse.data;

    if (task.status === TaskStatus.COMPLETED && task.outcome?.verificationStatus === 'verified') {
      return {
        taskId,
        status: task.status,
        verificationStatus: 'verified' as const,
        verifiedAt: task.outcome.verifiedAt || task.completedAt || new Date(),
      };
    }

    if (task.status !== TaskStatus.PENDING_REVIEW) {
      throw new BadRequestException('Only tasks pending review can be verified.');
    }

    const blockingChildTasks = await this.findBlockingChildTasks(task);
    if (blockingChildTasks.length > 0) {
      const hasDisputedChild = blockingChildTasks.some((child: any) =>
        child.status === TaskStatus.DISPUTED || child.outcome?.verificationStatus === 'disputed'
      );

      throw new BadRequestException(
        hasDisputedChild
          ? 'Cannot verify the parent task while a delegated child task is disputed.'
          : 'Cannot verify the parent task until all delegated child tasks are settled.'
      );
    }

    if (!task.assignedAgent) {
      throw new BadRequestException('Task has no assigned agent to verify.');
    }

    const verifiedAt = new Date();
    const completedAt = task.completedAt || task.outcome?.completedAt || verifiedAt;
    const updateResult = await this.updateById(taskId, {
      status: TaskStatus.COMPLETED,
      completedAt,
      'outcome.success': true,
      'outcome.result': task.outcome?.result ?? task.result,
      'outcome.artifacts': task.outcome?.artifacts || [],
      'outcome.verificationStatus': 'verified',
      'outcome.completedAt': completedAt,
      'outcome.verifiedAt': verifiedAt,
      'outcome.verifiedBy': verifierId,
      'outcome.feedback': feedback || task.outcome?.feedback || 'Verified by task poster.',
    } as any);

    if (!updateResult.success || !updateResult.data) {
      throw new Error('Failed to verify task');
    }

    await this.appendSettlementAuditEvent(taskId, {
      type: 'verified',
      message: 'Task poster verified the delivery and released settlement.',
      actorId: verifierId,
      details: this.buildTaskChainMetadata(task, {
        feedback: feedback || task.outcome?.feedback || null,
      }),
    });

    this.platformEvents.notifyTasksChanged();
    await this.recordSettlementOutcome(task, task.assignedAgent, true, { outcome: 'verified' });
    await this.updateAgentReputationSafely(task.assignedAgent, true, task.result?.metadata?.responseTime);

    return {
      taskId,
      status: updateResult.data.status,
      verificationStatus: 'verified',
      verifiedAt,
    };
  }

  async disputeTask(
    taskId: string,
    disputedBy: string,
    reason: string,
    feedback?: string,
    options: { allowAssignedAgentEscalation?: boolean } = {}
  ) {
    const taskResponse = await this.findById(taskId);

    if (!taskResponse.success || !taskResponse.data) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }

    const task = taskResponse.data;

    if (task.status === TaskStatus.DISPUTED && task.outcome?.verificationStatus === 'disputed') {
      return {
        taskId,
        status: task.status,
        verificationStatus: 'disputed' as const,
        reviewedAt: task.outcome.verifiedAt || task.completedAt || new Date(),
        disputeReason: task.outcome.disputeReason || reason,
      };
    }

    const blockingChildTasks = await this.findBlockingChildTasks(task);
    const canAssignedAgentEscalate =
      options.allowAssignedAgentEscalation &&
      task.assignedAgent === disputedBy &&
      blockingChildTasks.length > 0 &&
      [TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS, TaskStatus.PENDING_REVIEW].includes(task.status as TaskStatus);

    if (task.status !== TaskStatus.PENDING_REVIEW && !canAssignedAgentEscalate) {
      throw new BadRequestException('Only tasks pending review can be disputed.');
    }

    if (!task.assignedAgent) {
      throw new BadRequestException('Task has no assigned agent to dispute.');
    }

    const reviewedAt = new Date();
    const completedAt = task.completedAt || task.outcome?.completedAt || reviewedAt;
    const updateResult = await this.updateById(taskId, {
      status: TaskStatus.DISPUTED,
      completedAt,
      'outcome.success': false,
      'outcome.result': task.outcome?.result ?? task.result,
      'outcome.artifacts': task.outcome?.artifacts || [],
      'outcome.verificationStatus': 'disputed',
      'outcome.completedAt': completedAt,
      'outcome.verifiedAt': reviewedAt,
      'outcome.verifiedBy': disputedBy,
      'outcome.feedback':
        feedback ||
        task.outcome?.feedback ||
        (canAssignedAgentEscalate
          ? 'Escalated to dispute by the assigned agent due to a blocked delegated dependency.'
          : 'Disputed by task poster.'),
      'outcome.disputeReason': reason,
    } as any);

    if (!updateResult.success || !updateResult.data) {
      throw new Error('Failed to dispute task');
    }

    await this.appendSettlementAuditEvent(taskId, {
      type: canAssignedAgentEscalate ? 'escalated_to_dispute' : 'disputed',
      message: canAssignedAgentEscalate
        ? 'Assigned agent escalated the blocked delegation chain into dispute.'
        : 'Task poster disputed the delivery outcome.',
      actorId: disputedBy,
      reason,
      details: this.buildTaskChainMetadata(task, {
        escalatedByAssignedAgent: canAssignedAgentEscalate,
      }),
    });

    this.platformEvents.notifyTasksChanged();
    await this.recordSettlementOutcome(task, task.assignedAgent, false, {
      outcome: 'disputed',
      reason,
      escalatedByAssignedAgent: canAssignedAgentEscalate,
    });
    await this.updateAgentReputationSafely(task.assignedAgent, false, task.result?.metadata?.responseTime);

    return {
      taskId,
      status: updateResult.data.status,
      verificationStatus: 'disputed',
      reviewedAt,
      disputeReason: reason,
    };
  }

  async escalateTaskDispute(taskId: string, agentId: string, reason: string, feedback?: string) {
    return this.disputeTask(taskId, agentId, reason, feedback, {
      allowAssignedAgentEscalation: true,
    });
  }

  private async recordSettlementOutcome(
    task: any,
    agentId: string,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    const acceptedBid = task.bids?.find((bid: Bid) => bid.status === BidStatus.ACCEPTED);
    const settledAmount = acceptedBid?.amount ?? task.budget?.amount ?? 0;

    if (settledAmount <= 0) {
      return;
    }

    try {
      const taskId = this.getTaskId(task);
      await this.ensureTransactionRecorded({
        taskId,
        parentTaskId: task.parentTaskId ? String(task.parentTaskId) : undefined,
        rootTaskId: String(task.rootTaskId || task.parentTaskId || taskId),
        delegationDepth: Number(task.delegationDepth ?? 0),
        from: this.getEscrowAccount(taskId),
        to: success ? agentId : task.poster,
        amount: settledAmount,
        currency: task.budget?.currency || 'USD',
        type: success ? TransactionType.PAYMENT : TransactionType.REFUND,
        status: TransactionStatus.COMPLETED,
        escrowId: this.getEscrowId(taskId),
        metadata: this.buildTaskChainMetadata(task, {
          agentId,
          bidId: acceptedBid?.id,
          ...metadata,
        }),
      });

      if (task.parentTaskId) {
        await this.recordParentSettlementStatusFromChild(String(task.parentTaskId), task, success, agentId, metadata);

        if (!success) {
          await this.releaseParentReservedBudget(String(task.parentTaskId), Number(task.budget?.amount ?? settledAmount));
        }
      }

      this.platformEvents.notifyTasksChanged();
    } catch (error) {
      this.logger.error(`Failed to record settlement transaction for task ${String(task._id || task.id)}`, error as Error);
    }
  }

  private async updateAgentReputationSafely(agentId: string, success: boolean, responseTime?: number): Promise<void> {
    try {
      await this.agentsService.updateReputation(agentId, success, responseTime);
    } catch (error) {
      this.logger.error(`Failed to update agent reputation for ${agentId}`, error);
    }
  }

  private async releaseParentReservedBudget(parentTaskId: string, amountToRelease: number): Promise<void> {
    if (!parentTaskId || !Number.isFinite(amountToRelease) || amountToRelease <= 0) {
      return;
    }

    const parentResponse = await super.findById(parentTaskId);
    if (!parentResponse.success || !parentResponse.data) {
      return;
    }

    const currentReservedBudget = Number(parentResponse.data.reservedBudget ?? 0);
    const nextReservedBudget = Math.max(0, currentReservedBudget - amountToRelease);

    await super.updateById(parentTaskId, {
      reservedBudget: nextReservedBudget,
    } as any);

    await this.appendSettlementAuditEvent(parentTaskId, {
      type: 'reserved_budget_released',
      message: `Released ${(parentResponse.data.budget?.currency || 'USD')} ${amountToRelease.toFixed(2)} of reserved child-task budget back to the parent.`,
      details: {
        amountReleased: amountToRelease,
        reservedBudgetBefore: currentReservedBudget,
        reservedBudgetAfter: nextReservedBudget,
      },
    });
  }

  private async appendSettlementAuditEvent(
    taskId: string,
    event: {
      type: string;
      message: string;
      actorId?: string;
      reason?: string;
      relatedTaskId?: string;
      details?: Record<string, unknown>;
    }
  ): Promise<void> {
    if (!taskId) {
      return;
    }

    const taskResponse = await super.findById(taskId);
    if (!taskResponse.success || !taskResponse.data) {
      return;
    }

    const metadata = taskResponse.data.metadata && typeof taskResponse.data.metadata === 'object'
      ? { ...(taskResponse.data.metadata as Record<string, unknown>) }
      : {};
    const existingAudit = Array.isArray(metadata['settlementAudit'])
      ? (metadata['settlementAudit'] as Array<Record<string, unknown>>)
      : [];

    const nextAudit = [
      ...existingAudit,
      {
        ...event,
        at: new Date().toISOString(),
      },
    ].slice(-25);

    await super.updateById(taskId, {
      metadata: {
        ...metadata,
        settlementAudit: nextAudit,
      },
    } as any);
  }

  private async recordParentSettlementStatusFromChild(
    parentTaskId: string,
    childTask: any,
    success: boolean,
    agentId: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    if (!parentTaskId) {
      return;
    }

    const childTaskId = this.getTaskId(childTask);
    const outcome = String(metadata['outcome'] || (success ? 'verified' : 'disputed'));
    const reason = typeof metadata['reason'] === 'string' ? metadata['reason'] : undefined;

    await this.appendSettlementAuditEvent(parentTaskId, {
      type: success ? 'child_task_settled' : 'parent_settlement_blocked',
      message: success
        ? `Child task ${childTaskId} settled successfully (${outcome}).`
        : `Settlement is blocked by child task ${childTaskId}${reason ? `: ${reason}` : '.'}`,
      actorId: agentId,
      reason,
      relatedTaskId: childTaskId,
      details: this.buildTaskChainMetadata(childTask, {
        outcome,
        success,
      }),
    });

    const parentResponse = await super.findById(parentTaskId);
    if (!parentResponse.success || !parentResponse.data) {
      return;
    }

    const remainingBlockers = await this.findBlockingChildTasks(parentResponse.data);
    if (success && remainingBlockers.length === 0) {
      await this.appendSettlementAuditEvent(parentTaskId, {
        type: 'parent_settlement_unblocked',
        message: 'All delegated child tasks are now settled. Parent verification can proceed.',
        actorId: agentId,
        relatedTaskId: childTaskId,
        details: this.buildTaskChainMetadata(parentResponse.data),
      });
    }
  }

  private async decorateTaskWithSettlementState(task: any): Promise<any> {
    if (!task) {
      return task;
    }

    const settlementState = await this.buildSettlementState(task);
    const baseTask = typeof task?.toObject === 'function' ? task.toObject() : task;

    return {
      ...baseTask,
      ...settlementState,
    };
  }

  private async buildSettlementState(task: any): Promise<{
    settlementStatus: 'clear' | 'blocked' | 'blocked_by_dispute' | 'settled';
    settlementHoldReason?: string;
    blockedByTaskId?: string;
    blockedByStatus?: string;
    blockedByAgentId?: string;
  }> {
    const taskId = this.getTaskId(task);
    const ownStatus = String(task?.status || 'unknown');
    const ownVerificationStatus = String(task?.outcome?.verificationStatus || '');

    if (ownStatus === TaskStatus.DISPUTED || ownVerificationStatus === 'disputed') {
      return {
        settlementStatus: 'blocked_by_dispute',
        settlementHoldReason: 'task_disputed',
        blockedByTaskId: taskId,
        blockedByStatus: ownStatus,
        blockedByAgentId: task?.assignedAgent ? String(task.assignedAgent) : undefined,
      };
    }

    const childTasks = taskId
      ? await this.taskModel.find({ parentTaskId: taskId }).sort({ createdAt: 1 }).exec()
      : [];

    const blockingChild = childTasks.find((child: any) => {
      if (child.status === TaskStatus.COMPLETED && child.outcome?.verificationStatus === 'verified') {
        return false;
      }
      return true;
    });

    if (blockingChild) {
      const blockingStatus = String(blockingChild?.status || 'unknown');
      const blockedByDispute = blockingStatus === TaskStatus.DISPUTED || blockingChild?.outcome?.verificationStatus === 'disputed';

      return {
        settlementStatus: blockedByDispute ? 'blocked_by_dispute' : 'blocked',
        settlementHoldReason: blockedByDispute ? 'child_task_disputed' : 'child_task_unsettled',
        blockedByTaskId: this.getTaskId(blockingChild),
        blockedByStatus: blockingStatus,
        blockedByAgentId: blockingChild?.assignedAgent ? String(blockingChild.assignedAgent) : undefined,
      };
    }

    if (ownStatus === TaskStatus.COMPLETED && ownVerificationStatus === 'verified') {
      return {
        settlementStatus: 'settled',
      };
    }

    if (ownStatus === TaskStatus.PENDING_REVIEW || ownVerificationStatus === 'unverified') {
      return {
        settlementStatus: 'blocked',
        settlementHoldReason: 'awaiting_verification',
        blockedByTaskId: taskId,
        blockedByStatus: ownStatus,
        blockedByAgentId: task?.assignedAgent ? String(task.assignedAgent) : undefined,
      };
    }

    return {
      settlementStatus: 'clear',
    };
  }

  /**
   * Match task to suitable agents
   */
  async matchTask(taskId: string) {
    const taskResponse = await this.findById(taskId);
    
    if (!taskResponse.success || !taskResponse.data) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }

    const task = taskResponse.data;
    const requiredCapability = task.requirements.capabilities[0]; // Simplified: take first capability
    const minReputation = task.requirements.minReputation;

    const agentsResponse = await this.agentsService.findByCapability(
      requiredCapability,
      minReputation
    );

    if (!agentsResponse.success || !agentsResponse.data) {
      return {
        success: true,
        data: []
      };
    }

    // Extract agent IDs from paginated result
    const agents = agentsResponse.data.data || [];
    return {
      success: true,
      data: agents.map(agent => agent._id.toString())
    };
  }

  private getEscrowId(taskId: string): string {
    return `escrow_${taskId}`;
  }

  private getEscrowAccount(taskId: string): string {
    return `escrow:${taskId}`;
  }

  private getTaskId(task: any): string {
    return String(task?._id || task?.id || '');
  }

  private buildTaskChainMetadata(task: any, metadata: Record<string, unknown> = {}): Record<string, unknown> {
    const taskId = this.getTaskId(task);
    const parentTaskId = task?.parentTaskId ? String(task.parentTaskId) : undefined;
    const rootTaskId = String(task?.rootTaskId || parentTaskId || taskId);
    const delegationDepth = Number(task?.delegationDepth ?? (parentTaskId ? 1 : 0));

    return {
      parentTaskId,
      rootTaskId,
      delegationDepth,
      chainRole: parentTaskId ? 'child' : 'root',
      ...metadata,
    };
  }

  private async findBlockingChildTasks(task: any): Promise<any[]> {
    const childTaskIds = Array.isArray(task?.childTaskIds)
      ? task.childTaskIds.map((id: unknown) => String(id)).filter(Boolean)
      : [];

    if (childTaskIds.length === 0) {
      return [];
    }

    const childTasks = await this.taskModel.find({ _id: { $in: childTaskIds } }).exec();

    return childTasks.filter((child: any) => {
      if (child.status === TaskStatus.COMPLETED && child.outcome?.verificationStatus === 'verified') {
        return false;
      }
      return true;
    });
  }

  private async ensureTransactionRecorded(params: {
    taskId: string;
    parentTaskId?: string;
    rootTaskId?: string;
    delegationDepth?: number;
    from: string;
    to: string;
    amount: number;
    currency: string;
    type: TransactionType;
    status: TransactionStatus;
    escrowId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const existingTransactions = await this.transactionsService.findByTask(params.taskId);
    const alreadyRecorded = existingTransactions.some((tx) =>
      tx.type === params.type &&
      tx.from === params.from &&
      tx.to === params.to &&
      tx.amount === params.amount
    );

    if (alreadyRecorded) {
      return;
    }

    const createResult = await this.transactionsService.create({
      ...params,
      completedAt: params.status === TransactionStatus.COMPLETED ? new Date() : undefined,
      metadata: params.metadata || {},
    });

    if (!createResult.success) {
      throw new Error(createResult.error || `Failed to create ${params.type} transaction`);
    }
  }

  private async requestBidsFromMatchingAgents(task: any): Promise<void> {
    const requestedCapabilities = task.requirements?.capabilities || task.requirements?.skills || [];

    this.logger.log('Starting bid request for task', {
      taskId: task._id,
      title: task.title,
      capabilities: requestedCapabilities,
      budget: task.budget
    });

    if (!requestedCapabilities.length) {
      this.logger.debug('No capabilities specified, skipping');
      return;
    }

    const seenAgentIds = new Set<string>();

    for (const capability of requestedCapabilities) {
      this.logger.debug('Finding agents with capability', { capability });
      const agentsResponse = await this.agentsService.findByCapability(capability);
      const agents = agentsResponse.success ? agentsResponse.data?.data || [] : [];
      this.logger.debug('Found agents', { count: agents.length });

      for (const agent of agents) {
        const agentId = agent._id?.toString?.() || agent.id;

        if (!agentId || seenAgentIds.has(agentId) || !agent.mcpEndpoint) {
          if (!agentId) this.logger.debug('Skipping agent: no ID');
          else if (seenAgentIds.has(agentId)) this.logger.debug('Skipping agent: already evaluated', { agentId });
          else if (!agent.mcpEndpoint) this.logger.debug('Skipping agent: no MCP endpoint', { agentId });
          continue;
        }

        seenAgentIds.add(agentId);

        this.logger.debug('Requesting bid from agent', {
          agentId,
          agentName: agent.name,
          mcpEndpoint: agent.mcpEndpoint
        });

        try {
          const decision = await this.agentMcpClient.requestBid(agentId, agent.mcpEndpoint, {
            taskId: task._id.toString(),
            title: task.title,
            description: task.description,
            requirements: {
              skills: requestedCapabilities,
              budget: task.budget
                ? {
                    min: 0,
                    max: task.budget.amount,
                    currency: task.budget.currency || 'USD',
                  }
                : undefined,
            },
          });

          if (decision.interested) {
            await this.submitBid(task._id.toString(), {
              agentId,
              amount: decision.proposedAmount ?? 0,
              proposal: decision.proposal || 'Auto-submitted bid via MCP',
              estimatedDuration: decision.estimatedDuration,
            });
          }
        } catch (error) {
          this.logger.error(`Failed to request bid from agent ${agentId}`, error);
        }
      }
    }
  }

  /**
   * Find tasks by poster
   */
  async findByPoster(poster: string) {
    return this.findAll({ poster });
  }

  /**
   * Find tasks by status
   */
  async findByStatus(status: TaskStatus) {
    return this.findAll({ status });
  }

  /**
   * Find tasks assigned to an agent
   */
  async findByAgent(agentId: string) {
    return this.findAll({ assignedAgent: agentId });
  }
}
