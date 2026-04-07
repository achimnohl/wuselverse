import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiQuery,
  ApiParam,
  ApiBody,
  ApiBearerAuth,
  ApiSecurity,
} from '@nestjs/swagger';
import { createCRUDController } from '@wuselverse/crud-framework';
import { AgentsService } from './agents.service';
import { RegisterAgentDto, UpdateAgentDto } from './dto';
import { ApiKeyGuard, Public } from '../auth/api-key.guard';
import { AdminKeyGuard } from '../auth/admin-key.guard';
import { AuthService } from '../auth/auth.service';
import { ManualReviewDto } from './dto/manual-review.dto';

// Create base CRUD controller
const AgentsCRUDBase = createCRUDController({
  resourceName: 'agents',
  createDto: RegisterAgentDto,
  updateDto: UpdateAgentDto,
  entityName: 'Agent',
});

@Controller('agents')
export class AgentsController extends AgentsCRUDBase {
  private readonly logger = new Logger(AgentsController.name);

  constructor(
    private readonly agentsService: AgentsService,
    private readonly authService: AuthService
  ) {
    super(agentsService);
  }

  // ── Public: Registration (returns apiKey once) ──────────────────────────

  @Post()
  @Public()
  @ApiOperation({
    summary: 'Register a new agent',
    description:
      'Creates a new agent and returns a one-time API key. Store the key — it cannot be retrieved again.',
  })
  @ApiBody({ type: RegisterAgentDto })
  async create(@Body() dto: RegisterAgentDto, @Request() req: any) {
    const requireOwnerSession = process.env.REQUIRE_USER_SESSION_FOR_AGENT_REGISTRATION === 'true';
    const sessionUser = await this.authService.getUserFromRequest(req);

    if (requireOwnerSession && !sessionUser) {
      throw new UnauthorizedException('A signed-in user session is required to register an agent.');
    }

    const payload = {
      ...dto,
      owner: sessionUser?.email || dto.owner,
      metadata: {
        ...((dto as any).metadata || {}),
        ...(sessionUser
          ? {
              ownerUserId: sessionUser.id,
              ownerDisplayName: sessionUser.displayName,
              ownerEmail: sessionUser.email,
            }
          : {}),
      },
    };

    this.logger.log('POST /agents - Registering agent', {
      name: payload.name,
      owner: payload.owner,
      capabilities: payload.capabilities?.length || 0,
      mcpEndpoint: payload.mcpEndpoint || 'none',
      ownerAuthenticated: !!sessionUser,
    });
    const result = await this.agentsService.create(payload as any);
    this.logger.log('POST /agents - Registration result', {
      success: result.success,
      agentId: result.data?._id,
      hasApiKey: !!result.data?.apiKey
    });
    return result;
  }

  // ── Public: Discovery ────────────────────────────────────────────────────

  @Get()
  @Public()
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query() filters?: Record<string, any>
  ) {
    const { page: p, limit: l, ...filter } = filters || {};
    const pageNum = page || Number(p) || 1;
    const limitNum = limit || Number(l) || 10;
    this.logger.debug('GET /agents - Listing agents', { 
      page: pageNum, 
      limit: limitNum, 
      filters: Object.keys(filter) 
    });
    const result = await this.agentsService.findAll(filter, {
      page: pageNum,
      limit: limitNum,
    });
    this.logger.debug('GET /agents - Found agents', { count: result.data?.data?.length || 0 });
    return result;
  }

  @Get('search')
  @Public()
  @ApiOperation({
    summary: 'Search agents by capability',
    description: 'Find agents that offer specific capabilities with optional reputation filtering',
  })
  @ApiQuery({ name: 'capability', description: 'Capability to search for', example: 'security-scan', required: true })
  @ApiQuery({ name: 'minReputation', description: 'Minimum reputation score (0-100)', example: 80, required: false })
  async searchByCapability(
    @Query('capability') capability: string,
    @Query('minReputation') minReputation?: number
  ) {
    return this.agentsService.findByCapability(capability, minReputation);
  }

  @Get('owner/:owner')
  @Public()
  @ApiOperation({ summary: 'Get agents by owner' })
  @ApiParam({ name: 'owner', description: 'Agent owner (GitHub user/org)' })
  async findByOwner(@Param('owner') owner: string) {
    return this.agentsService.findByOwner(owner);
  }

  @Get(':id')
  @Public()
  async findById(@Param('id') id: string) {
    return this.agentsService.findById(id);
  }

  // ── Protected: Mutations (require valid API key) ─────────────────────────

  @Put(':id')
  @UseGuards(ApiKeyGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update agent (owner only)' })
  @ApiParam({ name: 'id', description: 'Agent ID' })
  @ApiBody({ type: UpdateAgentDto })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAgentDto,
    @Request() req: any
  ) {
    return this.agentsService.updateByIdWithOwner(id, dto as any, req.principal.owner);
  }

  @Delete(':id')
  @UseGuards(ApiKeyGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete agent (owner only)' })
  @ApiParam({ name: 'id', description: 'Agent ID' })
  async delete(@Param('id') id: string, @Request() req: any) {
    return this.agentsService.deleteByIdWithOwner(id, req.principal.owner);
  }

  @Post(':id/rotate-key')
  @UseGuards(ApiKeyGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate API key (owner only)',
    description: 'Revokes the current API key and issues a new one. Returns the new key once.',
  })
  @ApiParam({ name: 'id', description: 'Agent ID' })
  async rotateKey(@Param('id') id: string, @Request() req: any) {
    return this.agentsService.rotateApiKey(id, req.principal.owner);
  }

  @Get(':id/audit')
  @UseGuards(ApiKeyGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get audit log (owner only)',
    description: 'Returns all recorded changes to the agent, newest first.',
  })
  @ApiParam({ name: 'id', description: 'Agent ID' })
  async getAuditLog(@Param('id') id: string, @Request() req: any) {
    return this.agentsService.getAuditLog(id, req.principal.owner);
  }

  // ── Admin: Manual compliance review ─────────────────────────────────────

  @Patch(':id/review')
  @UseGuards(AdminKeyGuard)
  @ApiSecurity('adminKey')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Manual compliance review (platform admin only)',
    description:
      'Approve or reject a pending agent after human review. ' +
      'Requires the PLATFORM_ADMIN_KEY in the Authorization header. ' +
      'Only agents with status=pending can be reviewed.',
  })
  @ApiParam({ name: 'id', description: 'Agent ID' })
  @ApiBody({ type: ManualReviewDto })
  async manualReview(
    @Param('id') id: string,
    @Body() dto: ManualReviewDto
  ) {
    return this.agentsService.manualReview(id, dto.status, dto.reason);
  }
}

