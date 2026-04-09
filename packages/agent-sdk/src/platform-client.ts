import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  AgentRegistration,
  SearchTasksParams,
  PlatformTask,
  TaskChain,
  TaskResult,
} from './types';

function getSetCookieHeaders(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }

  const singleCookie = response.headers.get('set-cookie');
  return singleCookie ? [singleCookie] : [];
}

function mergeCookieHeader(existing: string | undefined, setCookieHeaders: string[]): string | undefined {
  const jar = new Map<string, string>();

  const applyCookieString = (cookieHeader?: string) => {
    if (!cookieHeader) return;
    cookieHeader.split(';').forEach((part) => {
      const [name, ...rest] = part.trim().split('=');
      if (!name || rest.length === 0) return;
      jar.set(name, rest.join('='));
    });
  };

  applyCookieString(existing);

  for (const cookie of setCookieHeaders) {
    const [nameValue] = cookie.split(';');
    const [name, ...rest] = nameValue.trim().split('=');
    if (!name || rest.length === 0) continue;
    jar.set(name, rest.join('='));
  }

  return jar.size ? [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ') : undefined;
}

/**
 * Client for interacting with the Wuselverse platform MCP tools
 */
export class WuselversePlatformClient {
  private client: Client;
  private platformUrl: string;
  private apiKey?: string;
  private agentId?: string;
  private ownerCookieHeader?: string;
  private csrfToken?: string;
  private connected = false;

  constructor(config: {
    platformUrl: string;
    apiKey?: string;
    agentId?: string;
    ownerCookieHeader?: string;
    csrfToken?: string;
  }) {
    this.platformUrl = config.platformUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.agentId = config.agentId;
    this.ownerCookieHeader = config.ownerCookieHeader;
    this.csrfToken = config.csrfToken;
    this.client = new Client(
      {
        name: 'wuselverse-agent-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );
  }

  setAgentCredentials(credentials: { agentId?: string; apiKey?: string }): void {
    if (credentials.agentId) {
      this.agentId = credentials.agentId;
    }
    if (credentials.apiKey) {
      this.apiKey = credentials.apiKey;
    }
  }

  setOwnerSession(session: { cookieHeader: string; csrfToken?: string | null }): void {
    this.ownerCookieHeader = session.cookieHeader;
    this.csrfToken = session.csrfToken || undefined;
  }

  async authenticateOwnerSession(credentials: {
    email: string;
    password: string;
    displayName?: string;
  }): Promise<void> {
    const registerPayload = {
      email: credentials.email,
      password: credentials.password,
      displayName: credentials.displayName || credentials.email,
    };

    try {
      await this.requestJson(`${this.platformUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registerPayload),
      });
    } catch (error: any) {
      if (error?.status !== 409) {
        throw error;
      }

      await this.requestJson(`${this.platformUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: credentials.email,
          password: credentials.password,
        }),
      });
    }

    await this.requestJson(`${this.platformUrl}/api/auth/me`, { method: 'GET' });

    if (!this.ownerCookieHeader || !this.csrfToken) {
      throw new Error('Owner session was created but the platform did not issue a cookie + CSRF token.');
    }
  }

  /**
   * Connect to the platform MCP server
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    // TODO: Implement actual connection to platform MCP endpoint.
    // For now the SDK intentionally falls back to REST for platform operations.
    this.connected = true;
  }

  /**
   * Register the agent with the platform.
   * Registration requires a signed-in human owner session in the current hardened flow.
   */
  async register(registration: AgentRegistration): Promise<{ agentId: string; apiKey: string }> {
    try {
      const data = await this.requestJson(`${this.platformUrl}/api/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registration),
      }, true);

      const agentId = data?.agentId || data?.data?._id || data?.data?.id || '';
      const apiKey = data?.apiKey || data?.data?.apiKey || '';

      if (!agentId) {
        throw new Error('Registration succeeded but no agent ID was returned.');
      }

      this.setAgentCredentials({ agentId, apiKey });
      return { agentId, apiKey };
    } catch (error: any) {
      if ([401, 403].includes(error?.status)) {
        throw new Error(
          'Agent registration requires a signed-in owner session. Call authenticateOwnerSession(...) or setOwnerSession(...) before register().'
        );
      }
      throw error;
    }
  }

  /**
   * Search for available tasks
   */
  async searchTasks(params: SearchTasksParams = {}): Promise<PlatformTask[]> {
    await this.connect();

    try {
      const result: any = await this.client.callTool({
        name: 'search_tasks',
        arguments: params as Record<string, unknown>,
      });

      const content = result.content?.[0] as { type: string; text: string } | undefined;
      if (content?.type === 'text') {
        const parsed = JSON.parse(content.text);
        return Array.isArray(parsed) ? parsed : parsed.items || parsed.data || [];
      }
      return [];
    } catch {
      const queryParams = new URLSearchParams();
      if (params.skills?.length) queryParams.set('skills', params.skills.join(','));
      if (params.status) queryParams.set('status', params.status);
      if (params.page) queryParams.set('page', params.page.toString());
      if (params.limit) queryParams.set('limit', params.limit.toString());

      const data = await this.requestJson(`${this.platformUrl}/api/tasks?${queryParams.toString()}`, {
        method: 'GET',
      });

      if (Array.isArray(data)) return data;
      if (Array.isArray(data?.items)) return data.items;
      if (Array.isArray(data?.data?.data)) return data.data.data;
      if (Array.isArray(data?.data)) return data.data;
      return [];
    }
  }

  /**
   * Submit a bid on a task
   */
  async submitBid(params: {
    taskId: string;
    agentId?: string;
    amount: number;
    proposal: string;
    estimatedDuration?: number;
  }): Promise<{ bidId: string }> {
    await this.connect();

    const agentId = params.agentId || this.agentId;
    if (!agentId) {
      throw new Error('submitBid requires an agentId or a previous register() call that stored the agent credentials.');
    }

    try {
      const result: any = await this.client.callTool({
        name: 'submit_bid',
        arguments: {
          ...params,
          agentId,
        },
      });

      const content = result.content?.[0] as { type: string; text: string } | undefined;
      if (content?.type === 'text') {
        return JSON.parse(content.text);
      }
      throw new Error('Invalid response from platform');
    } catch {
      const data = await this.requestJson(`${this.platformUrl}/api/tasks/${params.taskId}/bids`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          agentId,
          amount: params.amount,
          proposal: params.proposal,
          estimatedDuration: params.estimatedDuration,
        }),
      });

      const bids = data?.data?.bids || data?.bids || [];
      const lastBid = Array.isArray(bids) ? bids[bids.length - 1] : null;
      return { bidId: lastBid?.id || lastBid?._id || '' };
    }
  }

  /**
   * Complete a task and submit results
   */
  async completeTask(taskId: string, result: TaskResult): Promise<void> {
    await this.connect();

    try {
      await this.client.callTool({
        name: 'complete_task',
        arguments: {
          taskId,
          agentId: this.agentId,
          ...result,
        },
      });
    } catch {
      await this.requestJson(`${this.platformUrl}/api/tasks/${taskId}/complete`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(result),
      });
    }
  }

  /**
   * Create a delegated child task under an assigned parent task.
   */
  async createSubtask(params: {
    parentTaskId: string;
    agentId?: string;
    title: string;
    description: string;
    requirements: {
      capabilities: string[];
      minReputation?: number;
      maxResponseTime?: number;
      specificAgents?: string[];
      excludedAgents?: string[];
    };
    budget: {
      type: 'hourly' | 'fixed' | 'outcome-based';
      amount: number;
      currency: string;
    };
    acceptanceCriteria?: string[];
    deadline?: string;
    metadata?: Record<string, unknown>;
  }): Promise<PlatformTask> {
    await this.connect();

    const agentId = params.agentId || this.agentId;
    if (!agentId) {
      throw new Error('createSubtask requires an agentId or a previous register() call that stored the agent credentials.');
    }

    try {
      const result: any = await this.client.callTool({
        name: 'create_subtask',
        arguments: {
          ...params,
          agentId,
        },
      });

      const content = result.content?.[0] as { type: string; text: string } | undefined;
      if (content?.type === 'text') {
        const parsed = JSON.parse(content.text);
        return parsed?.data || parsed;
      }
      throw new Error('Invalid response from platform');
    } catch {
      const data = await this.requestJson(`${this.platformUrl}/api/tasks/${params.parentTaskId}/subtasks`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          ...params,
          agentId,
        }),
      });

      return data?.data || data;
    }
  }

  /**
   * Retrieve parent/child task-chain details for delegated work.
   */
  async getTaskChain(taskId: string): Promise<TaskChain> {
    await this.connect();

    try {
      const result: any = await this.client.callTool({
        name: 'get_task_chain',
        arguments: { taskId },
      });

      const content = result.content?.[0] as { type: string; text: string } | undefined;
      if (content?.type === 'text') {
        const parsed = JSON.parse(content.text);
        return parsed?.data || parsed;
      }
      throw new Error('Invalid response from platform');
    } catch {
      const data = await this.requestJson(`${this.platformUrl}/api/tasks/${taskId}/chain`, {
        method: 'GET',
      });

      return data?.data || data;
    }
  }

  private async requestJson(url: string, options: RequestInit = {}, useOwnerSession: boolean = false): Promise<any> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    if (useOwnerSession && this.ownerCookieHeader) {
      headers.Cookie = this.ownerCookieHeader;
    }

    if (useOwnerSession && this.csrfToken && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(options.method || 'GET').toUpperCase())) {
      headers['X-CSRF-Token'] = this.csrfToken;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (useOwnerSession) {
      this.ownerCookieHeader = mergeCookieHeader(this.ownerCookieHeader, getSetCookieHeaders(response));
      const csrfMatch = this.ownerCookieHeader?.match(/(?:^|;\s*)wuselverse_csrf=([^;]+)/);
      if (csrfMatch?.[1]) {
        this.csrfToken = decodeURIComponent(csrfMatch[1]);
      }
    }

    const text = await response.text();
    let payload: any = null;

    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }

    if (useOwnerSession && payload?.data?.csrfToken) {
      this.csrfToken = payload.data.csrfToken;
    }

    if (!response.ok) {
      const error = new Error(
        `${String(options.method || 'GET').toUpperCase()} ${url} failed: ${response.status} ${response.statusText}`
      ) as Error & { status?: number; payload?: unknown };
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  }

  /**
   * Get headers for REST API calls
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    return headers;
  }
}
