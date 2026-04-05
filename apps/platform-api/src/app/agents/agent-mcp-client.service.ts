import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export interface AgentMcpCallOptions {
  agentId: string;
  mcpEndpoint: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

/**
 * Service for calling agent MCP endpoints
 * Handles authentication and communication with agent MCP servers
 */
@Injectable()
export class AgentMcpClientService {
  private readonly logger = new Logger(AgentMcpClientService.name);
  private readonly platformApiKey: string;

  constructor(private readonly configService: ConfigService) {
    this.platformApiKey = this.configService.get<string>('PLATFORM_API_KEY') || '';
    
    if (!this.platformApiKey) {
      this.logger.warn(
        'PLATFORM_API_KEY not configured. Agent MCP authentication will fail.'
      );
    }
  }

  /**
   * Call an MCP tool on an agent's server
   */
  async callAgentTool<T = unknown>(options: AgentMcpCallOptions): Promise<T> {
    const { agentId, mcpEndpoint, toolName, arguments: args } = options;

    this.logger.debug('Calling agent MCP tool', {
      agentId,
      mcpEndpoint,
      toolName,
      argsKeys: Object.keys(args)
    });

    this.logger.log(
      `Calling agent ${agentId} MCP tool: ${toolName} at ${mcpEndpoint}`
    );

    try {
      // For HTTP-based MCP endpoints, use fetch with authentication
      if (mcpEndpoint.startsWith('http://') || mcpEndpoint.startsWith('https://')) {
        const result = await this.callHttpMcpTool<T>(mcpEndpoint, toolName, args);
        this.logger.log('MCP call successful', { agentId, toolName });
        return result;
      }

      // For other transports (stdio, etc.), would need different handling
      throw new Error(`Unsupported MCP endpoint protocol: ${mcpEndpoint}`);
    } catch (error) {
      this.logger.error('MCP call failed', {
        agentId,
        toolName,
        error: (error as Error).message
      });
      this.logger.error(
        `Failed to call agent ${agentId} MCP tool ${toolName}: ${(error as Error).message}`
      );
      throw error;
    }
  }

  /**
   * Call MCP tool via HTTP/HTTPS
   */
  private async callHttpMcpTool<T>(
    endpoint: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<T> {
    this.logger.debug('HTTP MCP request', {
      endpoint,
      toolName,
      argsPresent: Object.keys(args).length > 0
    });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Platform-API-Key': this.platformApiKey,
        'User-Agent': 'Wuselverse-Platform/1.0',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args,
        },
      }),
    });

    this.logger.debug('HTTP response', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });

    if (!response.ok) {
      throw new Error(`Agent MCP returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as any;

    if (data.error) {
      this.logger.error('MCP error response', data.error);
      throw new Error(`Agent MCP error: ${data.error.message || 'Unknown error'}`);
    }

    // Extract content from MCP response
    if (data.result?.content?.[0]?.text) {
      return JSON.parse(data.result.content[0].text) as T;
    }

    return data.result as T;
  }

  /**
   * Request a bid from an agent
   */
  async requestBid(
    agentId: string,
    mcpEndpoint: string,
    task: {
      taskId: string;
      title: string;
      description: string;
      requirements: {
        skills: string[];
        deadline?: string;
        budget?: { min: number; max: number; currency: string };
      };
    }
  ): Promise<{
    interested: boolean;
    proposedAmount?: number;
    estimatedDuration?: number;
    proposal?: string;
  }> {
    return this.callAgentTool({
      agentId,
      mcpEndpoint,
      toolName: 'request_bid',
      arguments: task,
    });
  }

  /**
   * Assign a task to an agent
   */
  async assignTask(
    agentId: string,
    mcpEndpoint: string,
    assignment: {
      taskId: string;
      bidId: string;
      escrowTransactionId: string;
      details: unknown;
    }
  ): Promise<{ accepted: boolean; message?: string }> {
    return this.callAgentTool({
      agentId,
      mcpEndpoint,
      toolName: 'assign_task',
      arguments: assignment,
    });
  }

  /**
   * Notify agent of payment status
   */
  async notifyPayment(
    agentId: string,
    mcpEndpoint: string,
    notification: {
      taskId: string;
      transactionId: string;
      amount: number;
      currency: string;
      status: 'escrow' | 'released' | 'refunded';
    }
  ): Promise<{ received: boolean; message?: string }> {
    return this.callAgentTool({
      agentId,
      mcpEndpoint,
      toolName: 'notify_payment',
      arguments: notification,
    });
  }
}
