import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  AgentRegistration,
  SearchTasksParams,
  PlatformTask,
  TaskResult,
} from './types';

/**
 * Client for interacting with the Wuselverse platform MCP tools
 */
export class WuselversePlatformClient {
  private client: Client;
  private platformUrl: string;
  private apiKey?: string;
  private connected: boolean = false;

  constructor(config: { platformUrl: string; apiKey?: string }) {
    this.platformUrl = config.platformUrl;
    this.apiKey = config.apiKey;
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

  /**
   * Connect to the platform MCP server
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    // TODO: Implement actual connection to platform MCP endpoint
    // For now, we'll use REST API fallback
    this.connected = true;
  }

  /**
   * Register the agent with the platform
   */
  async register(registration: AgentRegistration): Promise<{ agentId: string; apiKey: string }> {
    const response = await fetch(`${this.platformUrl}/api/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(registration),
    });

    if (!response.ok) {
      throw new Error(`Registration failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as any;
    const agentId = data?.agentId || data?.data?._id || data?.data?.id;
    const apiKey = data?.apiKey || '';

    this.apiKey = apiKey;
    return { agentId, apiKey };
  }

  /**
   * Search for available tasks
   */
  async searchTasks(params: SearchTasksParams = {}): Promise<PlatformTask[]> {
    await this.connect();

    try {
      // Try MCP tool first
      const result: any = await this.client.callTool({
        name: 'search_tasks',
        arguments: params as Record<string, unknown>,
      });

      const content = result.content[0] as { type: string; text: string };
      if (content.type === 'text') {
        return JSON.parse(content.text);
      }
      return [];
    } catch (error) {
      // Fallback to REST API
      const queryParams = new URLSearchParams();
      if (params.skills) queryParams.set('skills', params.skills.join(','));
      if (params.status) queryParams.set('status', params.status);
      if (params.page) queryParams.set('page', params.page.toString());
      if (params.limit) queryParams.set('limit', params.limit.toString());

      const response = await fetch(
        `${this.platformUrl}/api/tasks?${queryParams}`,
        {
          headers: this.getHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error(`Search tasks failed: ${response.statusText}`);
      }

      const data = (await response.json()) as { items?: PlatformTask[] } | PlatformTask[];
      return Array.isArray(data) ? data : data.items || [];
    }
  }

  /**
   * Submit a bid on a task
   */
  async submitBid(params: {
    taskId: string;
    amount: number;
    proposal: string;
    estimatedDuration?: number;
  }): Promise<{ bidId: string }> {
    await this.connect();

    try {
      // Try MCP tool first
      const result: any = await this.client.callTool({
        name: 'submit_bid',
        arguments: params as Record<string, unknown>,
      });

      const content = result.content[0] as { type: string; text: string };
      if (content.type === 'text') {
        return JSON.parse(content.text);
      }
      throw new Error('Invalid response from platform');
    } catch (error) {
      // Fallback to REST API
      const response = await fetch(`${this.platformUrl}/api/tasks/${params.taskId}/bids`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        throw new Error(`Submit bid failed: ${response.statusText}`);
      }

      return (await response.json()) as { bidId: string };
    }
  }

  /**
   * Complete a task and submit results
   */
  async completeTask(taskId: string, result: TaskResult): Promise<void> {
    await this.connect();

    try {
      // Try MCP tool first
      await this.client.callTool({
        name: 'complete_task',
        arguments: {
          taskId,
          ...result,
        },
      });
    } catch (error) {
      // Fallback to REST API
      const response = await fetch(`${this.platformUrl}/api/tasks/${taskId}/complete`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(result),
      });

      if (!response.ok) {
        throw new Error(`Complete task failed: ${response.statusText}`);
      }
    }
  }

  /**
   * Get headers for REST API calls
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    return headers;
  }
}
