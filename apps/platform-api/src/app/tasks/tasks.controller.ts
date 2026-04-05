import { Controller, Get, Post, Body, Param, Patch, Query, UseGuards, Request, Logger } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { createCRUDController } from '@wuselverse/crud-framework';
import { TasksService } from './tasks.service';
import { CreateTaskDto, SubmitBidDto, UpdateTaskDto } from './dto';
import { TaskStatus } from '@wuselverse/contracts';
import { ApiKeyGuard } from '../auth/api-key.guard';

// Create base CRUD controller
const TasksCRUDBase = createCRUDController({
  resourceName: 'tasks',
  createDto: CreateTaskDto,
  updateDto: UpdateTaskDto,
  entityName: 'Task'
});

@Controller('tasks')
export class TasksController extends TasksCRUDBase {
  private readonly logger = new Logger(TasksController.name);

  constructor(private readonly tasksService: TasksService) {
    super(tasksService);
  }

  // Custom endpoint: Submit a bid
  @Post(':id/bids')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'Submit a bid for a task', description: 'Agent submits a bid with price and estimated duration' })
  @ApiParam({ name: 'id', description: 'Task ID', example: 'task_abc123' })
  async submitBid(
    @Param('id') taskId: string,
    @Body() bid: SubmitBidDto
  ) {
    this.logger.debug('POST /tasks/:id/bids - Bid submission', {
      taskId,
      agentId: bid.agentId,
      amount: bid.amount,
      estimatedDuration: bid.estimatedDuration
    });
    const result = await this.tasksService.submitBid(taskId, bid as any);
    this.logger.log('POST /tasks/:id/bids - Bid submitted', {
      success: result.success,
      totalBids: result.data?.bids?.length || 0
    });
    return result;
  }

  // Custom endpoint: Get bids for a task
  @Get(':id/bids')
  @ApiOperation({ summary: 'Get all bids for a task' })
  @ApiParam({ name: 'id', description: 'Task ID' })
  async getBids(@Param('id') taskId: string) {
    const result = await this.tasksService.findById(taskId);
    if (!result.success || !result.data) {
      return { bids: [] };
    }
    return { bids: result.data.bids || [] };
  }

  // Custom endpoint: Assign task (accepts a bid)
  @Post(':id/assign')
  @ApiOperation({ summary: 'Assign task to agent', description: 'Accept a bid and assign the task to the bidding agent' })
  @ApiParam({ name: 'id', description: 'Task ID' })
  async assignTask(
    @Param('id') taskId: string,
    @Body() body: { bidId: string }
  ) {
    this.logger.log('POST /tasks/:id/assign - Assigning task', { taskId, bidId: body.bidId });
    const result = await this.tasksService.acceptBid(taskId, body.bidId);
    this.logger.log('POST /tasks/:id/assign - Assigned', {
      success: result.success,
      assignedAgent: result.data?.assignedAgent,
      status: result.data?.status
    });
    return result;
  }

  // Custom endpoint: Complete task
  @Post(':id/complete')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'Mark task as complete', description: 'Agent submits completion with output and artifacts' })
  @ApiParam({ name: 'id', description: 'Task ID' })
  async completeTask(
    @Param('id') taskId: string,
    @Body() completion: { output: any; artifacts?: any[] },
    @Request() req: any
  ) {
    const agentId = req.principal?.agentId;
    if (!agentId) {
      throw new Error('Agent ID not found in request');
    }

    this.logger.log('POST /tasks/:id/complete - Completing task', {
      taskId,
      agentId,
      hasOutput: !!completion.output,
      artifactsCount: completion.artifacts?.length || 0
    });

    const result = await this.tasksService.completeTask(taskId, agentId, {
      success: true,
      output: completion.output,
      artifacts: completion.artifacts || [],
    });

    this.logger.log('POST /tasks/:id/complete - Completed', {
      taskId: result.taskId,
      status: result.status,
      completedAt: result.completedAt
    });

    return {
      success: true,
      data: {
        taskId: result.taskId,
        status: result.status,
        completedAt: result.completedAt,
      },
    };
  }

  // Custom endpoint: Accept a bid
  @Patch(':id/bids/:bidId/accept')
  @ApiOperation({ summary: 'Accept a bid', description: 'Task poster accepts a bid and assigns the task to the agent' })
  @ApiParam({ name: 'id', description: 'Task ID', example: 'task_abc123' })
  @ApiParam({ name: 'bidId', description: 'Bid ID', example: 'bid_xyz789' })
  async acceptBid(
    @Param('id') taskId: string,
    @Param('bidId') bidId: string
  ) {
    return this.tasksService.acceptBid(taskId, bidId);
  }

  // Custom endpoint: Match task to agents
  @Get(':id/match')
  @ApiOperation({ summary: 'Find matching agents for task', description: 'Get a list of agents that match the task requirements' })
  @ApiParam({ name: 'id', description: 'Task ID', example: 'task_abc123' })
  async matchTask(@Param('id') taskId: string) {
    return this.tasksService.matchTask(taskId);
  }

  // Custom endpoint: Get tasks by poster
  @Get('poster/:poster')
  @ApiOperation({ summary: 'Get tasks by poster' })
  @ApiParam({ name: 'poster', description: 'Task poster (user ID)' })
  async findByPoster(@Param('poster') poster: string) {
    return this.tasksService.findByPoster(poster);
  }

  // Custom endpoint: Get tasks by status
  @Get('status/:status')
  @ApiOperation({ summary: 'Get tasks by status' })
  @ApiParam({ name: 'status', description: 'Task status', enum: TaskStatus })
  async findByStatus(@Param('status') status: TaskStatus) {
    return this.tasksService.findByStatus(status);
  }

  // Custom endpoint: Get tasks assigned to agent
  @Get('agent/:agentId')
  @ApiOperation({ summary: 'Get tasks assigned to an agent' })
  @ApiParam({ name: 'agentId', description: 'Agent ID' })
  async findByAgent(@Param('agentId') agentId: string) {
    return this.tasksService.findByAgent(agentId);
  }
}
