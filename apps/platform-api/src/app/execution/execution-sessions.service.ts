import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomUUID } from 'crypto';
import { Model } from 'mongoose';
import { ExecutionSessionDocument } from './execution-session.schema';
import { ExecutionHandshakeDocument } from './execution-handshake.schema';
import { TaskDocument } from '../tasks/task.schema';
import { AgentDocument } from '../agents/agent.schema';
import { CreateExecutionSessionDto } from './dto/create-execution-session.dto';
import { RegisterHandshakeParticipantDto } from './dto/register-handshake-participant.dto';

type Principal = {
  type: 'user' | 'agent';
  id: string;
  email?: string;
};

@Injectable()
export class ExecutionSessionsService {
  constructor(
    @InjectModel('ExecutionSession')
    private readonly executionSessionModel: Model<ExecutionSessionDocument>,
    @InjectModel('ExecutionHandshake')
    private readonly executionHandshakeModel: Model<ExecutionHandshakeDocument>,
    @InjectModel('Task')
    private readonly taskModel: Model<TaskDocument>,
    @InjectModel('Agent')
    private readonly agentModel: Model<AgentDocument>
  ) {}

  async createSession(principal: Principal, dto: CreateExecutionSessionDto) {
    const task = await this.taskModel.findById(dto.taskId).exec();
    if (!task) {
      throw new NotFoundException(`Task ${dto.taskId} not found`);
    }

    const expectedRole = this.resolveRoleForPrincipal(task, principal);
    if (!expectedRole) {
      throw new ForbiddenException('You are not authorized to create an execution session for this task.');
    }

    if (dto.role !== expectedRole) {
      throw new ForbiddenException(`Role mismatch for this caller. Expected '${expectedRole}'.`);
    }

    await this.ensureExecutionAuthCompatibility(task, dto.role);

    const ttlSeconds = dto.ttlSeconds ?? 600;
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + ttlSeconds * 1000);

    const rawToken = `est_${randomUUID().replace(/-/g, '')}`;
    const tokenHash = this.hashToken(rawToken);
    const tokenPreview = `${rawToken.slice(0, 18)}...`;

    const created = await new this.executionSessionModel({
      taskId: task._id.toString(),
      role: dto.role,
      status: 'active',
      tokenHash,
      tokenPreview,
      scopes: dto.scopes ?? [],
      audience: dto.audience,
      cnfJkt: dto.cnfJkt,
      subjectType: principal.type,
      subjectId: principal.id,
      issuedByType: principal.type,
      issuedById: principal.id,
      issuedAt,
      expiresAt,
      metadata: {
        taskStatus: task.status,
        assignedAgent: task.assignedAgent || null,
      },
    }).save();

    return {
      success: true,
      data: {
        id: created._id.toString(),
        token: rawToken,
        tokenType: 'execution_session',
        role: created.role,
        taskId: created.taskId,
        scopes: created.scopes,
        audience: created.audience,
        cnfJkt: created.cnfJkt,
        expiresAt: created.expiresAt,
      },
    };
  }

  async revokeSession(principal: Principal, sessionId: string) {
    const session = await this.executionSessionModel.findById(sessionId).exec();
    if (!session) {
      throw new NotFoundException(`Execution session ${sessionId} not found`);
    }

    const task = await this.taskModel.findById(session.taskId).exec();
    if (!task) {
      throw new NotFoundException(`Task ${session.taskId} not found`);
    }

    if (!this.canAccessTask(task, principal)) {
      throw new ForbiddenException('You are not authorized to revoke this execution session.');
    }

    if (session.status === 'revoked') {
      return {
        success: true,
        data: {
          id: session._id.toString(),
          status: session.status,
          revokedAt: session.revokedAt,
        },
      };
    }

    const now = new Date();
    session.status = 'revoked';
    session.revokedAt = now;
    session.revokedByType = principal.type;
    session.revokedById = principal.id;
    await session.save();

    return {
      success: true,
      data: {
        id: session._id.toString(),
        status: session.status,
        revokedAt: session.revokedAt,
      },
    };
  }

  async introspectSession(principal: Principal, sessionId: string) {
    const session = await this.executionSessionModel.findById(sessionId).exec();
    if (!session) {
      throw new NotFoundException(`Execution session ${sessionId} not found`);
    }

    const task = await this.taskModel.findById(session.taskId).exec();
    if (!task) {
      throw new NotFoundException(`Task ${session.taskId} not found`);
    }

    if (!this.canAccessTask(task, principal)) {
      throw new ForbiddenException('You are not authorized to introspect this execution session.');
    }

    const now = new Date();
    const isExpired = session.expiresAt.getTime() <= now.getTime();
    if (isExpired && session.status !== 'expired' && session.status !== 'revoked') {
      session.status = 'expired';
      await session.save();
    }

    return {
      success: true,
      data: {
        id: session._id.toString(),
        taskId: session.taskId,
        role: session.role,
        status: session.status,
        active: session.status === 'active' && !isExpired,
        scopes: session.scopes,
        audience: session.audience,
        cnfJkt: session.cnfJkt,
        subjectType: session.subjectType,
        subjectId: session.subjectId,
        tokenPreview: session.tokenPreview,
        issuedAt: session.issuedAt,
        expiresAt: session.expiresAt,
        revokedAt: session.revokedAt,
      },
    };
  }

  async validateRawToken(rawToken: string) {
    const tokenHash = this.hashToken(rawToken);
    const session = await this.executionSessionModel.findOne({ tokenHash }).exec();
    if (!session) {
      throw new UnauthorizedException('Invalid execution session token');
    }

    if (session.status === 'revoked') {
      throw new UnauthorizedException('Execution session token has been revoked');
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      if (session.status !== 'expired') {
        session.status = 'expired';
        await session.save();
      }
      throw new UnauthorizedException('Execution session token has expired');
    }

    return {
      id: session._id.toString(),
      taskId: session.taskId,
      role: session.role,
      scopes: session.scopes,
      audience: session.audience,
      cnfJkt: session.cnfJkt,
      subjectType: session.subjectType,
      subjectId: session.subjectId,
      expiresAt: session.expiresAt,
    };
  }

  async registerHandshakeParticipant(
    principal: Principal,
    sessionId: string,
    dto: RegisterHandshakeParticipantDto
  ) {
    const session = await this.executionSessionModel.findById(sessionId).exec();
    if (!session) {
      throw new NotFoundException(`Execution session ${sessionId} not found`);
    }

    const task = await this.taskModel.findById(session.taskId).exec();
    if (!task) {
      throw new NotFoundException(`Task ${session.taskId} not found`);
    }

    const principalRole = this.resolveRoleForPrincipal(task, principal);
    if (!principalRole) {
      throw new ForbiddenException('You are not a participant of the task for this session.');
    }

    if (principalRole !== dto.role) {
      throw new ForbiddenException(
        `Role mismatch: you are the '${principalRole}' for this task but tried to register as '${dto.role}'.`
      );
    }

    if (session.status !== 'active') {
      throw new ForbiddenException('Cannot register handshake for a non-active session.');
    }

    // Upsert — one registration per session per role
    const handshake = await this.executionHandshakeModel
      .findOneAndUpdate(
        { sessionId: session._id.toString(), role: dto.role },
        {
          sessionId: session._id.toString(),
          role: dto.role,
          endpointUrl: dto.endpointUrl,
          ephemeralPublicKey: dto.ephemeralPublicKey,
          keyAlgorithm: dto.keyAlgorithm,
          registeredByType: principal.type,
          registeredById: principal.id,
          expiresAt: session.expiresAt,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
      .exec();

    return {
      success: true,
      data: {
        sessionId: handshake!.sessionId,
        role: handshake!.role,
        endpointUrl: handshake!.endpointUrl,
        hasEphemeralKey: !!handshake!.ephemeralPublicKey,
        keyAlgorithm: handshake!.keyAlgorithm,
        registeredAt: handshake!.createdAt,
        expiresAt: handshake!.expiresAt,
      },
    };
  }

  async getHandshakeParticipant(principal: Principal, sessionId: string, role: 'consumer' | 'provider') {
    const session = await this.executionSessionModel.findById(sessionId).exec();
    if (!session) {
      throw new NotFoundException(`Execution session ${sessionId} not found`);
    }

    const task = await this.taskModel.findById(session.taskId).exec();
    if (!task) {
      throw new NotFoundException(`Task ${session.taskId} not found`);
    }

    if (!this.canAccessTask(task, principal)) {
      throw new ForbiddenException('You are not authorized to read handshake data for this session.');
    }

    const handshake = await this.executionHandshakeModel
      .findOne({ sessionId: session._id.toString(), role })
      .exec();

    if (!handshake) {
      throw new NotFoundException(`No handshake registered for role '${role}' on session ${sessionId}`);
    }

    return {
      success: true,
      data: {
        sessionId: handshake.sessionId,
        role: handshake.role,
        endpointUrl: handshake.endpointUrl,
        ephemeralPublicKey: handshake.ephemeralPublicKey,
        keyAlgorithm: handshake.keyAlgorithm,
        registeredAt: handshake.createdAt,
        expiresAt: handshake.expiresAt,
      },
    };
  }

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  private resolveRoleForPrincipal(task: TaskDocument, principal: Principal): 'consumer' | 'provider' | null {
    if (principal.type === 'agent') {
      return task.assignedAgent === principal.id ? 'provider' : null;
    }

    const metadata = (task.metadata || {}) as Record<string, unknown>;
    const taskPoster = String(task.poster || '');
    const posterUserId = typeof metadata.posterUserId === 'string' ? metadata.posterUserId : null;
    const posterEmail = typeof metadata.posterEmail === 'string' ? metadata.posterEmail : null;

    const matches =
      principal.id === posterUserId ||
      (!!principal.email && principal.email === posterEmail) ||
      (!!principal.email && principal.email === taskPoster) ||
      principal.id === taskPoster;

    return matches ? 'consumer' : null;
  }

  private canAccessTask(task: TaskDocument, principal: Principal): boolean {
    return this.resolveRoleForPrincipal(task, principal) !== null;
  }

  private async ensureExecutionAuthCompatibility(task: TaskDocument, role: 'consumer' | 'provider'): Promise<void> {
    if (role !== 'provider' && !task.assignedAgent) {
      // Consumer may pre-create session metadata before provider assignment in future flows.
      return;
    }

    if (!task.assignedAgent) {
      return;
    }

    const assignedAgent = await this.agentModel.findById(task.assignedAgent).exec();
    if (!assignedAgent) {
      return;
    }

    const executionAuth = (assignedAgent as any).executionAuth as { required?: boolean; mode?: string } | undefined;
    if (!executionAuth) {
      return;
    }

    if (executionAuth.required && executionAuth.mode && executionAuth.mode !== 'platform_token') {
      throw new ForbiddenException(
        `Assigned provider requires execution auth mode '${executionAuth.mode}', which is not compatible with platform token sessions.`
      );
    }
  }
}
