import { Resolver, Tool } from '@nestjs-mcp/server';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { z } from 'zod';
import { TasksService } from './tasks.service';
import { RequestHandlerExtra } from '@nestjs-mcp/server';
import { Logger } from '@nestjs/common';

// Zod schemas for tool parameters
const SearchTasksParams = z.object({
  skills: z.array(z.string()).optional().describe('Filter by required skills'),
  budget: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
  }).optional().describe('Budget range filter'),
  status: z.string().optional().describe('Task status filter'),
  page: z.number().optional().describe('Page number (default: 1)'),
  limit: z.number().optional().describe('Items per page (default: 10)'),
});

const SubmitBidParams = z.object({
  taskId: z.string().describe('Task identifier'),
  agentId: z.string().describe('Agent identifier'),
  amount: z.number().describe('Bid amount'),
  proposal: z.string().describe('Bid proposal text'),
  estimatedDuration: z.number().optional().describe('Estimated duration in seconds'),
});

const CompleteTaskParams = z.object({
  taskId: z.string().describe('Task identifier'),
  agentId: z.string().describe('Agent identifier'),
  success: z.boolean().describe('Whether task completed successfully'),
  output: z.any().describe('Task output/results'),
  artifacts: z.array(z.string()).optional().describe('URLs to output artifacts'),
  metadata: z.record(z.string(), z.any()).optional().describe('Additional metadata'),
});

const GetTaskDetailsParams = z.object({
  taskId: z.string().describe('Task identifier'),
});

const CreateSubtaskParams = z.object({
  parentTaskId: z.string().describe('Parent task identifier'),
  agentId: z.string().describe('Assigned parent-task agent creating the delegated subtask'),
  title: z.string().min(1).describe('Subtask title'),
  description: z.string().min(1).describe('Subtask description'),
  requirements: z.object({
    capabilities: z.array(z.string()).min(1).describe('Required capabilities for the delegated work'),
    minReputation: z.number().optional().describe('Optional minimum reputation score'),
    maxResponseTime: z.number().optional().describe('Optional response-time limit in milliseconds'),
    specificAgents: z.array(z.string()).optional().describe('Optional allow-list of agent IDs'),
    excludedAgents: z.array(z.string()).optional().describe('Optional deny-list of agent IDs'),
  }).describe('Subtask requirements'),
  budget: z.object({
    type: z.enum(['fixed', 'hourly', 'outcome-based']).describe('Budget type'),
    amount: z.number().positive().describe('Budget amount for the child task'),
    currency: z.string().default('USD').describe('Currency code'),
  }).describe('Subtask budget'),
  acceptanceCriteria: z.array(z.string()).optional().describe('Optional verification criteria for the subtask'),
  deadline: z.string().optional().describe('Optional ISO-8601 deadline'),
  metadata: z.record(z.string(), z.any()).optional().describe('Optional additional metadata'),
});

const GetTaskChainParams = z.object({
  taskId: z.string().describe('Task identifier'),
});

/**
 * MCP tools for task-related operations
 * These tools are exposed to agents for interacting with the task marketplace
 */
@Resolver('tasks')
export class TasksMcpResolver {
  private readonly logger = new Logger(TasksMcpResolver.name);

  constructor(private readonly tasksService: TasksService) {}

  /**
   * Search for available tasks
   */
  @Tool({
    name: 'search_tasks',
    description: 'Search for available tasks in the marketplace',
    paramsSchema: SearchTasksParams.shape,
  })
  async searchTasks(
    params: z.infer<typeof SearchTasksParams>,
    extra?: RequestHandlerExtra,
  ): Promise<CallToolResult> {
    this.logger.debug('MCP: search_tasks', {
      skills: params.skills,
      budget: params.budget,
      status: params.status,
      page: params.page || 1,
      sessionId: extra?.sessionId
    });
    const { skills, budget, status, page = 1, limit = 10 } = params;

    const query: any = {};

    // Build query filters
    if (skills && skills.length > 0) {
      query['requirements.capabilities'] = { $in: skills };
    }

    if (status) {
      query.status = status;
    } else {
      // Default to open tasks
      query.status = 'open';
    }

    if (budget) {
      if (budget.min !== undefined) {
        query['budget.amount'] = { $gte: budget.min };
      }
      if (budget.max !== undefined) {
        query['budget.amount'] = { 
          ...query['budget.amount'],
          $lte: budget.max 
        };
      }
    }

    const tasks = await this.tasksService.findPaginated(query, page, limit);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            items: tasks.items,
            total: tasks.total,
            page: tasks.page,
            totalPages: tasks.totalPages,
          }),
        },
      ],
    };
  }

  /**
   * Submit a bid on a task
   */
  @Tool({
    name: 'submit_bid',
    description: 'Submit a bid on a task',
    paramsSchema: SubmitBidParams.shape,
  })
  async submitBid(
    params: z.infer<typeof SubmitBidParams>,
    extra?: RequestHandlerExtra,
  ): Promise<CallToolResult> {
    this.logger.log('MCP: submit_bid', {
      taskId: params.taskId,
      agentId: params.agentId,
      amount: params.amount,
      sessionId: extra?.sessionId
    });

    const bid = await this.tasksService.createBid(
      params.taskId,
      params.agentId,
      {
        amount: params.amount,
        proposal: params.proposal,
        estimatedDuration: params.estimatedDuration,
      },
    );

    this.logger.log('MCP: Bid created', {
      bidId: bid.id,
      status: bid.status
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            bidId: bid.id,
            status: bid.status,
            createdAt: bid.timestamp,
          }),
        },
      ],
    };
  }

  /**
   * Complete a task and submit results
   */
  @Tool({
    name: 'complete_task',
    description: 'Mark a task as completed and submit results',
    paramsSchema: CompleteTaskParams.shape,
  })
  async completeTask(
    params: z.infer<typeof CompleteTaskParams>,
    extra?: RequestHandlerExtra,
  ): Promise<CallToolResult> {
    this.logger.log('MCP: complete_task', {
      taskId: params.taskId,
      agentId: params.agentId,
      success: params.success,
      sessionId: extra?.sessionId
    });

    const result = await this.tasksService.completeTask(
      params.taskId,
      params.agentId,
      {
        success: params.success,
        output: params.output,
        artifacts: params.artifacts,
        metadata: params.metadata,
      },
    );

    this.logger.log('MCP: Task completed', {
      taskId: result.taskId,
      status: result.status
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            taskId: result.taskId,
            status: result.status,
            completedAt: result.completedAt,
          }),
        },
      ],
    };
  }

  /**
   * Create a delegated child task from an assigned parent task
   */
  @Tool({
    name: 'create_subtask',
    description: 'Create a delegated subtask under an assigned parent task while respecting the remaining parent budget',
    paramsSchema: CreateSubtaskParams.shape,
  })
  async createSubtask(
    params: z.infer<typeof CreateSubtaskParams>,
    extra?: RequestHandlerExtra,
  ): Promise<CallToolResult> {
    this.logger.log('MCP: create_subtask', {
      parentTaskId: params.parentTaskId,
      agentId: params.agentId,
      amount: params.budget.amount,
      sessionId: extra?.sessionId,
    });

    try {
      const result = await this.tasksService.createSubtask(params.parentTaskId, params.agentId, {
        title: params.title,
        description: params.description,
        requirements: params.requirements,
        budget: params.budget,
        acceptanceCriteria: params.acceptanceCriteria,
        deadline: params.deadline,
        metadata: params.metadata,
      });

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to create subtask');
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result.data),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error.message || 'Failed to create subtask',
            }),
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Get task details
   */
  @Tool({
    name: 'get_task_details',
    description: 'Get detailed information about a specific task',
    paramsSchema: GetTaskDetailsParams.shape,
  })
  async getTaskDetails(
    params: z.infer<typeof GetTaskDetailsParams>,
    _extra?: RequestHandlerExtra,
  ): Promise<CallToolResult> {
    const task = await this.tasksService.findById(params.taskId);

    if (!task.success || !task.data) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: 'Task not found' }),
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(task.data),
        },
      ],
    };
  }

  /**
   * Get parent/child chain details for a task
   */
  @Tool({
    name: 'get_task_chain',
    description: 'Get the current task together with its parent, children, and chain metadata for delegated work',
    paramsSchema: GetTaskChainParams.shape,
  })
  async getTaskChain(
    params: z.infer<typeof GetTaskChainParams>,
    _extra?: RequestHandlerExtra,
  ): Promise<CallToolResult> {
    try {
      const chain = await this.tasksService.getTaskChain(params.taskId);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(chain),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error.message || 'Failed to get task chain',
            }),
          },
        ],
        isError: true,
      };
    }
  }
}
