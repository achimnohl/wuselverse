import { Injectable, Logger } from '@nestjs/common';
import { EncryptionService } from '../common/encryption.service';

const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';
const BETA_HEADER = 'managed-agents-2026-04-01';

/** How often to poll the session for completion (ms) */
const POLL_INTERVAL_MS = 3_000;
/** Maximum time to wait for a CMA session to complete (ms) */
const POLL_TIMEOUT_MS = 5 * 60 * 1_000; // 5 minutes

export interface CmaAgentConfig {
  agentId: string;
  environmentId: string;
  /** AES-256-GCM encrypted Anthropic API key stored in the agent document */
  anthropicApiKeyEncrypted: string;
  anthropicModel?: string;
  permissionPolicy?: 'always_allow' | 'always_ask';
  skillIds?: string[];
}

export interface CmaTaskResult {
  success: boolean;
  output: Record<string, unknown>;
}

interface CmaFailureRecord {
  /** When the agent was marked as unhealthy */
  timestamp: Date;
  /** Error message from Anthropic API */
  error: string;
  /** HTTP status code (if applicable) */
  statusCode?: number;
}

@Injectable()
export class CmaExecutionService {
  private readonly logger = new Logger(CmaExecutionService.name);
  
  /**
   * In-memory cache of CMA agents that have failed with permanent errors.
   * Key: MongoDB agent ID, Value: failure record.
   * Time-to-live (TTL) controlled by CMA_FAILURE_CACHE_HOURS env var.
   */
  private readonly failureCache = new Map<string, CmaFailureRecord>();

  constructor(private readonly encryptionService: EncryptionService) {}

  private async anthropicRequest(apiKey: string, method: string, path: string, body?: unknown): Promise<any> {
    const res = await fetch(`${ANTHROPIC_BASE}${path}`, {
      method,
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': BETA_HEADER,
        'content-type': 'application/json',
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const json: any = await res.json();
    if (!res.ok) {
      const error = new Error(`Anthropic ${method} ${path} -> ${res.status}: ${JSON.stringify(json)}`);
      (error as any).statusCode = res.status;
      throw error;
    }
    return json;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  /**
   * Check if a CMA agent is marked as unhealthy due to previous permanent failures.
   * Returns true if the agent should be excluded from auto-bidding.
   */
  isAgentUnhealthy(mongoAgentId: string): boolean {
    const record = this.failureCache.get(mongoAgentId);
    if (!record) return false;

    // Check TTL - default 24 hours
    const cacheTtlHours = parseInt(process.env.CMA_FAILURE_CACHE_HOURS || '24', 10);
    if (cacheTtlHours <= 0) {
      // TTL disabled - never expire cache entries
      return true;
    }

    const expiresAt = new Date(record.timestamp.getTime() + cacheTtlHours * 60 * 60 * 1000);
    if (new Date() > expiresAt) {
      // Expired - remove from cache and allow retry
      this.failureCache.delete(mongoAgentId);
      this.logger.debug('CMA failure cache entry expired', { 
        mongoAgentId, 
        cachedError: record.error 
      });
      return false;
    }

    return true;
  }

  /**
   * Mark a CMA agent as unhealthy after a permanent failure.
   * Only caches specific error types that indicate the agent is permanently unavailable.
   */
  markAgentUnhealthy(mongoAgentId: string, error: Error, statusCode?: number): void {
    const errorMsg = error.message.toLowerCase();
    
    // Only cache permanent failures (not transient network errors or rate limits)
    const isPermanentError = 
      errorMsg.includes('agent not found') ||
      errorMsg.includes('invalid agent') ||
      errorMsg.includes('agent_id') ||
      errorMsg.includes('authentication') ||
      errorMsg.includes('invalid api key') ||
      errorMsg.includes('api key') ||
      errorMsg.includes('unauthorized') ||
      statusCode === 401 || // Unauthorized
      statusCode === 403 || // Forbidden
      statusCode === 404;   // Not Found

    if (!isPermanentError) {
      this.logger.debug('CMA error is transient, not caching', { 
        mongoAgentId, 
        error: error.message, 
        statusCode 
      });
      return;
    }

    this.failureCache.set(mongoAgentId, {
      timestamp: new Date(),
      error: error.message,
      statusCode,
    });

    this.logger.warn('CMA agent marked as unhealthy', {
      mongoAgentId,
      error: error.message,
      statusCode,
      cacheTtlHours: process.env.CMA_FAILURE_CACHE_HOURS || '24',
    });
  }

  /**
   * Clear the failure cache for a specific agent (used after re-registration or manual intervention).
   */
  clearAgentFailureCache(mongoAgentId: string): void {
    if (this.failureCache.delete(mongoAgentId)) {
      this.logger.log('Cleared CMA failure cache for agent', { mongoAgentId });
    }
  }

  /**
   * Extract the agent's text reply from the events list.
   * Looks for the last `agent.message` event with text content.
   */
  private extractReplyFromEvents(events: any[]): string | null {
    const agentMessages = (events ?? []).filter((e: any) => e.type === 'agent.message');
    if (!agentMessages.length) return null;
    const last = agentMessages[agentMessages.length - 1];
    const parts: any[] = last.content ?? last.message?.content ?? [];
    const textPart = parts.find((p: any) => p.type === 'text');
    return textPart?.text ?? null;
  }

  /**
   * Start a CMA session, send the task, poll for completion, and return the result.
   * Execution is fully server-side — no outbound callback URL needed.
   */
  async executeTask(
    claudeManaged: CmaAgentConfig,
    taskDescription: string,
    taskId: string,
  ): Promise<CmaTaskResult> {
    this.logger.log('Starting CMA session (polling mode)', {
      agentId: claudeManaged.agentId,
      taskId,
    });

    const apiKey = this.encryptionService.decrypt(claudeManaged.anthropicApiKeyEncrypted);

    const session = await this.anthropicRequest(apiKey, 'POST', '/sessions', {
      agent: claudeManaged.agentId,
      environment_id: claudeManaged.environmentId,
    });
    this.logger.debug(`CMA session created: ${session.id}`);

    const prompt = [
      `Please complete the following task and respond with only the result — no preamble or meta-commentary.`,
      ``,
      taskDescription,
    ].join('\n');

    await this.anthropicRequest(apiKey, 'POST', `/sessions/${session.id}/events`, {
      events: [
        {
          type: 'user.message',
          content: [{ type: 'text', text: prompt }],
        },
      ],
    });

    this.logger.log(`CMA session ${session.id} started — polling for completion`, { taskId });

    // Poll until the session reaches a terminal state
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await this.sleep(POLL_INTERVAL_MS);

      const sessionState = await this.anthropicRequest(apiKey, 'GET', `/sessions/${session.id}`);
      const status: string = sessionState.status ?? '';

      this.logger.debug(`CMA session ${session.id} status: ${status}`);

      if (status === 'completed' || status === 'succeeded') {
        const eventsRes = await this.anthropicRequest(apiKey, 'GET', `/sessions/${session.id}/events`);
        const events: any[] = eventsRes.events ?? eventsRes.data ?? eventsRes ?? [];
        const reply = this.extractReplyFromEvents(events);
        return { success: true, output: { summary: reply ?? '(no output)' } };
      }

      if (status === 'failed' || status === 'error' || status === 'cancelled') {
        const errorMsg = sessionState.error?.message ?? sessionState.message ?? status;
        this.logger.warn(`CMA session ${session.id} ended with status: ${status}`, { errorMsg });
        return { success: false, output: { error: errorMsg } };
      }
    }

    this.logger.warn(`CMA session ${session.id} timed out after ${POLL_TIMEOUT_MS / 1000}s`);
    return { success: false, output: { error: `CMA session timed out after ${POLL_TIMEOUT_MS / 1000}s` } };
  }
}
