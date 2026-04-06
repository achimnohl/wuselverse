import { Injectable, NotFoundException, Logger } from '@nestjs/common';
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
      status: TaskStatus.OPEN,
      bids: [],
    };

    const result = await super.create(taskData);

    if (result.success && result.data) {
      const createdTask = result.data!;
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
    const bid = task.bids?.find(b => b.id === bidId);

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
    task.bids = task.bids?.map(b => ({
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
          from: task.poster,
          to: this.getEscrowAccount(taskId),
          amount: bid.amount,
          currency: task.budget?.currency || 'USD',
          type: TransactionType.ESCROW_LOCK,
          status: TransactionStatus.COMPLETED,
          escrowId: this.getEscrowId(taskId),
          metadata: {
            bidId: bid.id,
            agentId: bid.agentId,
            budgetType: task.budget?.type,
            stage: 'assignment'
          }
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

    return {
      items,
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
      throw new Error('Only assigned agent can complete the task');
    }

    if (task.status !== TaskStatus.ASSIGNED && task.status !== TaskStatus.IN_PROGRESS) {
      throw new Error('Task is not in a completable state');
    }

    const updateResult = await this.updateById(taskId, {
      status: resultData.success ? TaskStatus.COMPLETED : TaskStatus.FAILED,
      completedAt: new Date(),
      result: {
        ...resultData,
      },
    });

    if (!updateResult.success || !updateResult.data) {
      throw new Error('Failed to update task');
    }

    this.platformEvents.notifyTasksChanged();

    const acceptedBid = task.bids?.find((bid) => bid.status === BidStatus.ACCEPTED);
    const settledAmount = acceptedBid?.amount ?? task.budget?.amount ?? 0;

    if (settledAmount > 0) {
      try {
        await this.ensureTransactionRecorded({
          taskId,
          from: this.getEscrowAccount(taskId),
          to: resultData.success ? agentId : task.poster,
          amount: settledAmount,
          currency: task.budget?.currency || 'USD',
          type: resultData.success ? TransactionType.PAYMENT : TransactionType.REFUND,
          status: TransactionStatus.COMPLETED,
          escrowId: this.getEscrowId(taskId),
          metadata: {
            agentId,
            bidId: acceptedBid?.id,
            outcome: resultData.success ? 'completed' : 'failed'
          }
        });
      } catch (error) {
        this.logger.error(`Failed to record settlement transaction for task ${taskId}`, error as Error);
      }
    }

    // Update agent reputation after task completion
    try {
      await this.agentsService.updateReputation(
        agentId,
        resultData.success,
        resultData.metadata?.responseTime
      );
    } catch (error) {
      this.logger.error(`Failed to update agent reputation for ${agentId}`, error);
      // Don't fail the task completion if reputation update fails
    }

    return {
      taskId,
      status: updateResult.data.status,
      completedAt: new Date(),
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

  private async ensureTransactionRecorded(params: {
    taskId: string;
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
      metadata: params.metadata || {}
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
