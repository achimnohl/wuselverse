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
}
