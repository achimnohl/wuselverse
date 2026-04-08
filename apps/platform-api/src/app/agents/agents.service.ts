import { Injectable, ForbiddenException, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createHash, randomUUID } from 'crypto';
import { BaseMongoService } from '@wuselverse/crud-framework';
import { AgentStatus } from '@wuselverse/contracts';
import { AgentDocument } from './agent.schema';
import { AgentApiKeyDocument } from './agent-api-key.schema';
import { AgentAuditLogDocument, AuditAction } from './agent-audit-log.schema';
import { ComplianceService } from '../compliance/compliance.service';
import { PlatformEventsService } from '../realtime/platform-events.service';

@Injectable()
export class AgentsService extends BaseMongoService<AgentDocument> {
  private readonly logger = new Logger(AgentsService.name);

  constructor(
    @InjectModel('Agent') private agentModel: Model<AgentDocument>,
    @InjectModel('AgentApiKey') private apiKeyModel: Model<AgentApiKeyDocument>,
    @InjectModel('AgentAuditLog') private auditLogModel: Model<AgentAuditLogDocument>,
    private readonly complianceService: ComplianceService,
    private readonly platformEvents: PlatformEventsService
  ) {
    super(agentModel);
  }

  /**
   * Override create to:
   * 1. Save agent with status=pending
   * 2. Generate & store API key (returned once to caller)
   * 3. Run compliance evaluation asynchronously
   * 4. Update status to approved/rejected/needs_review; emit audit log
   */
  override async create(createDto: Partial<AgentDocument>): Promise<any> {
    const owner = createDto.owner || 'unknown';
    const slug = this.normalizeSlug((createDto as any).slug || (createDto as any).agentSlug, createDto.name || 'agent');

    this.logger.debug('Registering agent', {
      name: createDto.name,
      owner,
      slug,
      capabilities: (createDto.capabilities as any[])?.length || 0,
      mcpEndpoint: createDto.mcpEndpoint || 'none'
    });

    const existing = await this.agentModel.findOne({ owner, slug }).exec();
    const dtoWithDefaults = this.buildRegistrationPayload(createDto, slug, existing);

    if (existing) {
      const agentId = existing._id.toString();
      this.logger.log('Existing agent matched by owner+slug, updating in place', { agentId, owner, slug });

      const updated = await this.agentModel
        .findByIdAndUpdate(existing._id, dtoWithDefaults, { new: true, runValidators: true })
        .exec();

      if (!updated) {
        throw new NotFoundException(`Agent ${agentId} not found during upsert`);
      }

      const rawKey = await this.issueApiKey(agentId, updated.owner, true);

      await this.emitAudit({
        agentId,
        action: 'updated',
        changedFields: ['name', 'slug', 'description', 'offerDescription', 'userManual', 'pricing', 'capabilities', 'status', 'mcpEndpoint', 'a2aEndpoint', 'manifestUrl', 'metadata'],
        previousValues: {
          name: existing.name,
          slug: existing.slug,
          description: existing.description,
          pricing: existing.pricing,
          capabilities: existing.capabilities,
          status: existing.status,
        },
        newValues: {
          name: updated.name,
          slug: updated.slug,
          description: updated.description,
          pricing: updated.pricing,
          capabilities: updated.capabilities,
          status: updated.status,
        },
        actorId: updated.owner,
        sessionId: null,
      });

      this.platformEvents.notifyAgentsChanged();

      this.runComplianceCheck(agentId, updated).catch((err) => {
        this.logger.error(`Compliance check error for updated agent ${agentId}`, err);
      });

      return {
        success: true,
        data: updated,
        message: 'Agent updated successfully',
        apiKey: rawKey,
        complianceStatus: 'pending',
        wasUpdated: true,
      };
    }

    const result = await super.create(dtoWithDefaults as any);
    if (!result.success || !result.data) {
      this.logger.error('Failed to create agent', result.error);
      return result;
    }

    const agent = result.data;
    const agentId = agent._id.toString();

    this.logger.log('Agent created, generating API key', { agentId, slug });

    const rawKey = await this.issueApiKey(agentId, agent.owner);

    this.logger.debug('API key generated', { agentId, keyPreview: rawKey.substring(0, 20) + '...' });

    await this.emitAudit({
      agentId,
      action: 'created',
      changedFields: ['name', 'slug', 'owner', 'status', 'pricing', 'capabilities'],
      previousValues: {},
      newValues: { name: agent.name, slug: agent.slug, owner: agent.owner, status: AgentStatus.PENDING },
      actorId: agent.owner,
      sessionId: null,
    });

    this.platformEvents.notifyAgentsChanged();

    this.logger.log('Starting async compliance check', { agentId });

    this.runComplianceCheck(agentId, agent).catch((err) => {
      this.logger.error(`Compliance check error for agent ${agentId}`, err);
    });

    this.logger.log('Agent registration complete', { agentId, hasApiKey: true, slug });

    return { ...result, apiKey: rawKey, complianceStatus: 'pending', wasUpdated: false };
  }

  /**
   * Update agent fields after verifying the caller owns the agent.
   * Emits an audit log entry on success.
   */
  async updateByIdWithOwner(
    id: string,
    updateDto: Record<string, unknown>,
    owner: string,
    sessionId?: string
  ): Promise<any> {
    const existing = await this.agentModel.findById(id).exec();
    if (!existing) throw new NotFoundException(`Agent ${id} not found`);
    if (existing.owner !== owner)
      throw new ForbiddenException('You do not own this agent');

    if ('slug' in updateDto || 'agentSlug' in updateDto) {
      const normalizedSlug = this.normalizeSlug(
        String((updateDto as any).slug || (updateDto as any).agentSlug || existing.slug || existing.name),
        existing.name
      );
      const conflictingAgent = await this.agentModel
        .findOne({ owner, slug: normalizedSlug, _id: { $ne: existing._id } })
        .exec();

      if (conflictingAgent) {
        throw new ConflictException(`You already have an agent registered with slug "${normalizedSlug}"`);
      }

      (updateDto as any).slug = normalizedSlug;
      delete (updateDto as any).agentSlug;
    }

    const changedFields = Object.keys(updateDto);
    const previousValues: Record<string, unknown> = {};
    for (const field of changedFields) {
      previousValues[field] = (existing as any)[field];
    }

    const result = await this.updateById(id, updateDto as any);
    if (result.success) {
      await this.emitAudit({
        agentId: id,
        action: 'updated',
        changedFields,
        previousValues,
        newValues: updateDto,
        actorId: owner,
        sessionId: sessionId ?? null,
      });
      this.platformEvents.notifyAgentsChanged();
    }
    return result;
  }

  /**
   * Delete agent after verifying ownership. Emits an audit log entry.
   */
  async deleteByIdWithOwner(id: string, owner: string): Promise<any> {
    const existing = await this.agentModel.findById(id).exec();
    if (!existing) throw new NotFoundException(`Agent ${id} not found`);
    if (existing.owner !== owner)
      throw new ForbiddenException('You do not own this agent');

    const result = await this.deleteById(id);
    if (result.success) {
      await this.emitAudit({
        agentId: id,
        action: 'deleted',
        changedFields: [],
        previousValues: { name: existing.name },
        newValues: {},
        actorId: owner,
        sessionId: null,
      });
      this.platformEvents.notifyAgentsChanged();
    }
    return result;
  }

  /**
   * Revoke all existing API keys for the agent and issue a new one.
   * Requires ownership. Emits an audit log entry.
   */
  async rotateApiKey(agentId: string, owner: string): Promise<{ apiKey: string }> {
    const agent = await this.agentModel.findById(agentId).exec();
    if (!agent) throw new NotFoundException(`Agent ${agentId} not found`);
    if (agent.owner !== owner)
      throw new ForbiddenException('You do not own this agent');

    await this.apiKeyModel
      .updateMany({ agentId, revokedAt: null }, { revokedAt: new Date() })
      .exec();

    const rawKey = `wusel_${randomUUID().replace(/-/g, '')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    await new this.apiKeyModel({ agentId, keyHash, owner }).save();

    await this.emitAudit({
      agentId,
      action: 'key_rotated',
      changedFields: ['apiKey'],
      previousValues: {},
      newValues: {},
      actorId: owner,
      sessionId: null,
    });

    this.platformEvents.notifyAgentsChanged();

    return { apiKey: rawKey };
  }

  /**
   * Return the full audit log for an agent (owner-only).
   */
  async getAuditLog(agentId: string, owner: string): Promise<AgentAuditLogDocument[]> {
    const agent = await this.agentModel.findById(agentId).exec();
    if (!agent) throw new NotFoundException(`Agent ${agentId} not found`);
    if (agent.owner !== owner)
      throw new ForbiddenException('You do not own this agent');

    return this.auditLogModel.find({ agentId }).sort({ timestamp: -1 }).exec();
  }

  /**
   * Validate a raw API key and return the associated principal.
   * Returns null if the key is invalid or revoked.
   */
  async validateApiKey(rawKey: string): Promise<{ agentId: string; owner: string } | null> {
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const apiKey = await this.apiKeyModel.findOne({ keyHash, revokedAt: null }).exec();
    if (!apiKey) return null;
    return { agentId: apiKey.agentId, owner: apiKey.owner };
  }

  /**
   * Set the status of an agent that is in `pending` state on behalf of a
   * platform operator after manual compliance review.
   * Only `pending` agents can be reviewed; those already `active` or `rejected`
   * must be re-registered.
   */
  async manualReview(
    agentId: string,
    status: 'active' | 'rejected',
    reason?: string
  ): Promise<any> {
    const agent = await this.agentModel.findById(agentId).exec();
    if (!agent) throw new NotFoundException(`Agent ${agentId} not found`);
    if (agent.status !== AgentStatus.PENDING) {
      throw new ConflictException(
        `Agent is already in status '${agent.status}'. Only pending agents can be manually reviewed.`
      );
    }

    const newStatus = status === 'active' ? AgentStatus.ACTIVE : AgentStatus.REJECTED;
    await this.agentModel.updateOne({ _id: agentId }, { status: newStatus }).exec();

    await this.emitAudit({
      agentId,
      action: 'updated',
      changedFields: ['status'],
      previousValues: { status: AgentStatus.PENDING },
      newValues: { status: newStatus, reviewReason: reason ?? null },
      actorId: 'system:admin',
      sessionId: null,
    });

    this.platformEvents.notifyAgentsChanged();

    return { success: true, data: { agentId, status: newStatus, reason: reason ?? null } };
  }

  /**
   * Find agents by capability with optional reputation filter.
   */
  async findByCapability(capability: string, minReputation?: number) {
    this.logger.debug('Searching agents by capability', { capability, minReputation });
    
    const filter: any = {
      'capabilities.skill': capability,
      // In MVP, allow searching all agents regardless of status
      // status: 'active',
    };
    if (minReputation !== undefined) {
      filter['reputation.score'] = { $gte: minReputation };
    }
    
    const result = await this.findAll(filter);
    
    this.logger.debug('Found agents', {
      capability,
      count: result.data?.data?.length || 0
    });
    
    return result;
  }

  /**
   * Find agents by owner.
   */
  async findByOwner(owner: string) {
    return this.findAll({ owner });
  }

  /**
   * Update agent reputation after job completion.
   */
  async updateReputation(agentId: string, success: boolean, responseTime?: number) {
    const agent = await this.agentModel.findById(agentId).exec();
    if (!agent) throw new Error('Agent not found');

    const reputation = agent.reputation;
    reputation.totalJobs += 1;
    if (success) {
      reputation.successfulJobs += 1;
    } else {
      reputation.failedJobs += 1;
    }

    if (responseTime) {
      const totalResponseTime =
        reputation.averageResponseTime * (reputation.totalJobs - 1);
      reputation.averageResponseTime =
        (totalResponseTime + responseTime) / reputation.totalJobs;
    }

    const successRate = reputation.successfulJobs / reputation.totalJobs;
    reputation.score = Math.round(successRate * 100);

    const result = await this.updateById(agentId, {
      reputation,
      successCount: reputation.successfulJobs,
    });

    if (result.success) {
      this.platformEvents.notifyAgentsChanged();
    }

    return result;
  }

  private buildRegistrationPayload(
    createDto: Partial<AgentDocument>,
    slug: string,
    existing?: AgentDocument | null
  ): Partial<AgentDocument> {
    const incomingMetadata = ((createDto.metadata as Record<string, unknown> | undefined) ?? {});
    const existingMetadata = ((existing?.metadata as Record<string, unknown> | undefined) ?? {});
    const providedCapabilities = (createDto as any).detailedCapabilities ||
      (Array.isArray(createDto.capabilities) && typeof createDto.capabilities[0] === 'string'
        ? createDto.capabilities.map((skill: any) => ({
            skill,
            description: `${skill} capability`,
            inputs: [],
            outputs: [],
          }))
        : createDto.capabilities);

    return {
      ...createDto,
      slug,
      name: createDto.name || existing?.name || 'Unnamed Agent',
      description: createDto.description || existing?.description || 'No description provided',
      offerDescription:
        createDto.offerDescription ||
        existing?.offerDescription ||
        createDto.description ||
        existing?.description ||
        'No description provided',
      userManual:
        createDto.userManual ||
        existing?.userManual ||
        '# User Manual\n\nDocumentation coming soon.',
      owner: createDto.owner || existing?.owner || 'unknown',
      pricing: createDto.pricing || existing?.pricing || {
        type: 'fixed',
        amount: 0,
        currency: 'USD',
      },
      reputation: createDto.reputation || existing?.reputation || {
        score: 0,
        totalJobs: 0,
        successfulJobs: 0,
        failedJobs: 0,
        averageResponseTime: 0,
        reviews: [],
      },
      rating: createDto.rating ?? existing?.rating ?? null,
      successCount: createDto.successCount ?? existing?.successCount ?? 0,
      metadata: {
        ...existingMetadata,
        ...incomingMetadata,
      },
      capabilities: providedCapabilities || existing?.capabilities || [],
      mcpEndpoint: createDto.mcpEndpoint ?? existing?.mcpEndpoint,
      githubAppId: createDto.githubAppId ?? existing?.githubAppId,
      a2aEndpoint: createDto.a2aEndpoint ?? existing?.a2aEndpoint,
      manifestUrl: createDto.manifestUrl ?? existing?.manifestUrl,
      status: AgentStatus.PENDING,
    };
  }

  private normalizeSlug(candidate: string | undefined, fallbackName?: string): string {
    const rawValue = String(candidate || fallbackName || 'agent').trim().toLowerCase();
    const normalized = rawValue
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-');

    return normalized || `agent-${randomUUID().slice(0, 8)}`;
  }

  private async issueApiKey(agentId: string, owner: string, revokeExisting: boolean = false): Promise<string> {
    if (revokeExisting) {
      await this.apiKeyModel.updateMany({ agentId, revokedAt: null }, { revokedAt: new Date() }).exec();
    }

    const rawKey = `wusel_${randomUUID().replace(/-/g, '')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    await new this.apiKeyModel({ agentId, keyHash, owner }).save();

    return rawKey;
  }

  private async runComplianceCheck(agentId: string, agent: AgentDocument): Promise<void> {
    this.logger.log('Starting compliance check', { 
      agentId, 
      name: agent.name,
      capabilities: agent.capabilities?.length 
    });

    const result = await this.complianceService.evaluate({
      name: agent.name,
      description: agent.description,
      offerDescription: agent.offerDescription ?? '',
      capabilities: agent.capabilities ?? [],
      pricing: agent.pricing,
      mcpEndpoint: agent.mcpEndpoint,
    });

    this.logger.log('Compliance decision', {
      agentId,
      decision: result.decision,
      violations: result.violations,
      reason: result.reason
    });

    const newStatus =
      result.decision === 'approved'
        ? AgentStatus.ACTIVE
        : result.decision === 'rejected'
        ? AgentStatus.REJECTED
        : AgentStatus.PENDING; // 'needs_review' keeps agent in pending for manual review

    await this.agentModel.updateOne({ _id: agentId }, { status: newStatus }).exec();

    this.logger.log('Agent status updated', {
      agentId,
      oldStatus: AgentStatus.PENDING,
      newStatus
    });

    await this.emitAudit({
      agentId,
      action: 'updated',
      changedFields: ['status'],
      previousValues: { status: AgentStatus.PENDING },
      newValues: { status: newStatus, complianceDecision: result.decision, complianceReason: result.reason },
      actorId: 'system:compliance',
      sessionId: null,
    });

    this.platformEvents.notifyAgentsChanged();

    if (result.decision !== 'approved') {
      this.logger.warn(
        `Agent ${agentId} not approved - decision=${result.decision}, violations=${result.violations.join(', ')}`
      );
    } else {
      this.logger.log('Agent approved', { agentId });
    }
  }

  private async emitAudit(entry: {
    agentId: string;
    action: AuditAction;
    changedFields: string[];
    previousValues: Record<string, unknown>;
    newValues: Record<string, unknown>;
    actorId: string;
    sessionId: string | null;
  }): Promise<void> {
    await new this.auditLogModel(entry).save().catch((err) => {
      console.error('[Audit] Failed to write audit log:', err);
    });
  }
}
