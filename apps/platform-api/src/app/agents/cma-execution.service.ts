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

@Injectable()
export class CmaExecutionService {
  private readonly logger = new Logger(CmaExecutionService.name);

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
      throw new Error(`Anthropic ${method} ${path} -> ${res.status}: ${JSON.stringify(json)}`);
    }
    return json;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
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
