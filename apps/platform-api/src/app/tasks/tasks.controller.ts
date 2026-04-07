import { Controller, Delete, Get, Post, Put, Body, Param, Patch, Query, UseGuards, Request, Logger, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { createCRUDController } from '@wuselverse/crud-framework';
import { TasksService } from './tasks.service';
import { CreateTaskDto, SubmitBidDto, UpdateTaskDto } from './dto';
import { TaskStatus } from '@wuselverse/contracts';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { AuthService } from '../auth/auth.service';

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

  constructor(
    private readonly tasksService: TasksService,
    private readonly authService: AuthService
  ) {
    super(tasksService);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new task', description: 'Creates a task. When session auth is enabled, the poster identity is bound to the signed-in user.' })
  async create(
    @Body() dto: CreateTaskDto,
    @Request() req: any
  ) {
    const requireUserSession = process.env.REQUIRE_USER_SESSION_FOR_TASK_POSTING === 'true';
    const sessionUser = await this.authService.getUserFromRequest(req);

    if (requireUserSession && !sessionUser) {
      throw new UnauthorizedException('A signed-in user session is required to create tasks.');
    }

    const payload = {
      ...dto,
      poster: sessionUser?.id || dto.poster,
      metadata: {
        ...(dto.metadata || {}),
        ...(sessionUser
          ? {
              posterUserId: sessionUser.id,
              posterDisplayName: sessionUser.displayName,
              posterEmail: sessionUser.email,
            }
          : {}),
      },
    };

    return this.tasksService.create(payload as any);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a task', description: 'Updates a task. When task session auth is enabled, only the authenticated poster can update it.' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
    @Request() req: any
  ) {
    await this.assertTaskPosterAccess(req, id);
    return this.tasksService.updateById(id, dto as any);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a task', description: 'Deletes a task. When task session auth is enabled, only the authenticated poster can delete it.' })
  async delete(@Param('id') id: string, @Request() req: any) {
    await this.assertTaskPosterAccess(req, id);
    return this.tasksService.deleteById(id);
  }

  // Custom endpoint: Submit a bid
  @Post(':id/bids')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'Submit a bid for a task', description: 'Agent submits a bid with price and estimated duration' })
  @ApiParam({ name: 'id', description: 'Task ID', example: 'task_abc123' })
  async submitBid(
    @Param('id') taskId: string,
    @Body() bid: SubmitBidDto,
    @Request() req: any
  ) {
    const authenticatedAgentId = req.principal?.agentId || bid.agentId;

    this.logger.debug('POST /tasks/:id/bids - Bid submission', {
      taskId,
      agentId: authenticatedAgentId,
      amount: bid.amount,
      estimatedDuration: bid.estimatedDuration
    });
    const result = await this.tasksService.submitBid(taskId, {
      ...bid,
      agentId: authenticatedAgentId,
    } as any);
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
    @Body() body: { bidId: string },
    @Request() req: any
  ) {
    await this.assertTaskPosterAccess(req, taskId);

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
    @Param('bidId') bidId: string,
    @Request() req: any
  ) {
    await this.assertTaskPosterAccess(req, taskId);
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

  private async assertTaskPosterAccess(req: any, taskId: string): Promise<void> {
    const requirePosterSession = process.env.REQUIRE_USER_SESSION_FOR_TASK_ASSIGNMENT === 'true';
    if (!requirePosterSession) {
      return;
    }

    const sessionUser = await this.authService.getUserFromRequest(req);
    if (!sessionUser) {
      throw new UnauthorizedException('A signed-in user session is required for this task action.');
    }

    const taskResponse = await this.tasksService.findById(taskId);
    const poster = taskResponse.success ? String(taskResponse.data?.poster || '') : '';
    const allowedPosters = new Set([sessionUser.id, sessionUser.email]);

    if (poster && !allowedPosters.has(poster)) {
      throw new ForbiddenException('Only the authenticated task poster can perform this action.');
    }
  }
}
