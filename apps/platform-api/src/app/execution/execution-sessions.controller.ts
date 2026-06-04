import { Body, Controller, Get, Param, Post, Request, UseGuards, UnauthorizedException } from '@nestjs/common';
import { ApiOperation, ApiParam } from '@nestjs/swagger';
import { AnyAuthGuard } from '../auth/any-auth.guard';
import { SessionCsrfGuard } from '../auth/session-csrf.guard';
import { CreateExecutionSessionDto } from './dto/create-execution-session.dto';
import { RegisterHandshakeParticipantDto } from './dto/register-handshake-participant.dto';
import { ExecutionSessionsService } from './execution-sessions.service';

@Controller('execution/sessions')
export class ExecutionSessionsController {
  constructor(private readonly executionSessionsService: ExecutionSessionsService) {}

  @Post()
  @UseGuards(AnyAuthGuard, SessionCsrfGuard)
  @ApiOperation({
    summary: 'Create execution session token',
    description:
      'Creates a short-lived execution session token scoped to a task and role for off-platform MCP/A2A execution coordination. API keys are the primary auth model for programmatic use; browser session + CSRF remains supported for UI flows.',
  })
  async create(@Body() dto: CreateExecutionSessionDto, @Request() req: any) {
    const principal = this.getPrincipal(req);
    
    // Auto-propagate actor chain from est_* token context if not explicitly provided in DTO
    if (!dto.actorChain && req.principal?.actorChain) {
      dto.actorChain = req.principal.actorChain;
    }
    
    // Auto-propagate intent, maxBudget, requiredCapabilities if available in request context
    if (!dto.intent && req.principal?.intent) {
      dto.intent = req.principal.intent;
    }
    if (!dto.maxBudget && req.principal?.maxBudget) {
      dto.maxBudget = req.principal.maxBudget;
    }
    if (!dto.requiredCapabilities && req.principal?.requiredCapabilities) {
      dto.requiredCapabilities = req.principal.requiredCapabilities;
    }
    
    return this.executionSessionsService.createSession(principal, dto);
  }

  @Post(':id/revoke')
  @UseGuards(AnyAuthGuard, SessionCsrfGuard)
  @ApiOperation({
    summary: 'Revoke execution session token',
    description: 'Revokes an existing execution session token for a task participant. API keys are the primary auth model for programmatic use; browser session + CSRF remains supported for UI flows.',
  })
  @ApiParam({ name: 'id', description: 'Execution session ID' })
  async revoke(@Param('id') id: string, @Request() req: any) {
    const principal = this.getPrincipal(req);
    return this.executionSessionsService.revokeSession(principal, id);
  }

  @Get(':id/introspect')
  @UseGuards(AnyAuthGuard, SessionCsrfGuard)
  @ApiOperation({
    summary: 'Introspect execution session token',
    description: 'Returns session status and claims metadata for authorized task participants. API keys are the primary auth model for programmatic use; browser session + CSRF remains supported for UI flows.',
  })
  @ApiParam({ name: 'id', description: 'Execution session ID' })
  async introspect(@Param('id') id: string, @Request() req: any) {
    const principal = this.getPrincipal(req);
    return this.executionSessionsService.introspectSession(principal, id);
  }

  @Post(':id/participants')
  @UseGuards(AnyAuthGuard, SessionCsrfGuard)
  @ApiOperation({
    summary: 'Register handshake participant',
    description:
      'Registers the caller\'s off-platform execution endpoint URL and optional ephemeral public key for a session. Used by both consumer and provider to publish where they can be reached for MCP/A2A task execution. API keys are the primary auth model for programmatic use.',
  })
  @ApiParam({ name: 'id', description: 'Execution session ID' })
  async registerParticipant(
    @Param('id') id: string,
    @Body() dto: RegisterHandshakeParticipantDto,
    @Request() req: any
  ) {
    const principal = this.getPrincipal(req);
    return this.executionSessionsService.registerHandshakeParticipant(principal, id, dto);
  }

  @Get(':id/participants/:role')
  @UseGuards(AnyAuthGuard, SessionCsrfGuard)
  @ApiOperation({
    summary: 'Get handshake participant metadata',
    description:
      'Returns the registered off-platform execution endpoint and ephemeral public key for a given role (consumer or provider) on a session. Only accessible to task participants. API keys are the primary auth model for programmatic use.',
  })
  @ApiParam({ name: 'id', description: 'Execution session ID' })
  @ApiParam({ name: 'role', description: 'Participant role: consumer or provider', enum: ['consumer', 'provider'] })
  async getParticipant(
    @Param('id') id: string,
    @Param('role') role: 'consumer' | 'provider',
    @Request() req: any
  ) {
    const principal = this.getPrincipal(req);
    return this.executionSessionsService.getHandshakeParticipant(principal, id, role);
  }

  private getPrincipal(req: any): { type: 'user' | 'agent'; id: string; email?: string } {
    if (req?.principal?.type === 'user') {
      return {
        type: 'user',
        id: req.principal.userId,
        email: req.principal.email,
      };
    }

    if (req?.principal?.type === 'agent') {
      return {
        type: 'agent',
        id: req.principal.agentId,
      };
    }

    throw new UnauthorizedException('Authentication required.');
  }
}
