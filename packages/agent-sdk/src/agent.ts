import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import {
  AgentConfig,
  TaskRequest,
  BidDecision,
  TaskAssignment,
  TaskDetails,
  TaskResult,
  PaymentNotification,
} from './types';

/**
 * Base class for Wuselverse agents
 * Provides MCP server setup and required tool handlers
 */
export abstract class WuselverseAgent {
  protected mcpServer: Server;
  protected config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
    this.mcpServer = new Server(
      {
        name: config.name,
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupMcpHandlers();
  }

  /**
   * Set up MCP request handlers
   */
  private setupMcpHandlers(): void {
    // List available tools
    this.mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.getAgentTools(),
      };
    });

    // Handle tool calls with authentication validation
    this.mcpServer.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      // Validate platform API key if configured
      if (this.config.platformApiKey) {
        const providedKey = (extra as any)?.meta?.['X-Platform-API-Key'];
        if (providedKey !== this.config.platformApiKey) {
          throw new Error('Unauthorized: Invalid platform API key');
        }
      }

      const { name, arguments: args } = request.params;

      switch (name) {
        case 'request_bid':
          return await this.handleBidRequest(args as any);
        case 'assign_task':
          return await this.handleTaskAssignment(args as any);
        case 'notify_payment':
          return await this.handlePaymentNotification(args as any);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  /**
   * Define the MCP tools this agent exposes
   */
  private getAgentTools(): Tool[] {
    return [
      {
        name: 'request_bid',
        description: 'Request a bid from the agent for a specific task',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Task identifier' },
            title: { type: 'string', description: 'Task title' },
            description: { type: 'string', description: 'Task description' },
            requirements: {
              type: 'object',
              properties: {
                skills: { type: 'array', items: { type: 'string' } },
                deadline: { type: 'string' },
                budget: {
                  type: 'object',
                  properties: {
                    min: { type: 'number' },
                    max: { type: 'number' },
                    currency: { type: 'string' },
                  },
                },
              },
            },
          },
          required: ['taskId', 'title', 'description', 'requirements'],
        },
      },
      {
        name: 'assign_task',
        description: 'Assign a task to the agent after bid acceptance',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Task identifier' },
            bidId: { type: 'string', description: 'Accepted bid identifier' },
            escrowTransactionId: { type: 'string', description: 'Escrow transaction ID' },
            details: {
              type: 'object',
              description: 'Full task details',
            },
          },
          required: ['taskId', 'bidId', 'escrowTransactionId', 'details'],
        },
      },
      {
        name: 'notify_payment',
        description: 'Notify agent of payment status changes',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string' },
            transactionId: { type: 'string' },
            amount: { type: 'number' },
            currency: { type: 'string' },
            status: { 
              type: 'string',
              enum: ['escrow', 'released', 'refunded']
            },
          },
          required: ['taskId', 'transactionId', 'amount', 'currency', 'status'],
        },
      },
    ];
  }

  /**
   * Handle bid request from platform
   */
  private async handleBidRequest(task: TaskRequest): Promise<any> {
    try {
      const decision = await this.evaluateTask(task);
      
      if (!decision.interested) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                interested: false,
                reason: 'Task does not match agent capabilities',
              }),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              interested: true,
              proposedAmount: decision.proposedAmount,
              estimatedDuration: decision.estimatedDuration,
              proposal: decision.proposal,
              metadata: decision.metadata,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: error instanceof Error ? error.message : 'Unknown error',
            }),
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Handle task assignment
   */
  private async handleTaskAssignment(assignment: TaskAssignment): Promise<any> {
    try {
      // Start execution in background
      this.executeTaskAsync(assignment);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              accepted: true,
              message: 'Task accepted and execution started',
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: error instanceof Error ? error.message : 'Unknown error',
            }),
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Handle payment notification
   */
  private async handlePaymentNotification(notification: PaymentNotification): Promise<any> {
    try {
      await this.onPaymentNotification(notification);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              received: true,
              message: 'Payment notification processed',
            }),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: error instanceof Error ? error.message : 'Unknown error',
            }),
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Execute task asynchronously and report results
   */
  private async executeTaskAsync(assignment: TaskAssignment): Promise<void> {
    try {
      const result = await this.executeTask(assignment.taskId, assignment.details);

      if (this.config.platformUrl && this.config.apiKey) {
        const response = await fetch(`${this.config.platformUrl}/api/tasks/${assignment.taskId}/complete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            output: result.output,
            artifacts: result.artifacts || [],
            metadata: result.metadata || {},
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to report task completion: ${response.status} ${response.statusText}`);
        }

        console.log('[Agent] Task completed and reported:', assignment.taskId);
      } else {
        console.log('[Agent] Task completed:', assignment.taskId, result);
      }
    } catch (error) {
      console.error('[Agent] Task execution failed:', error);
    }
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.mcpServer.connect(transport);
    console.log(`[${this.config.name}] MCP server started`);
  }

  /**
   * Abstract methods to be implemented by concrete agents
   */

  /**
   * Evaluate a task and decide whether to bid
   */
  abstract evaluateTask(task: TaskRequest): Promise<BidDecision>;

  /**
   * Execute an assigned task
   */
  abstract executeTask(taskId: string, details: TaskDetails): Promise<TaskResult>;

  /**
   * Handle payment notifications (optional override)
   */
  async onPaymentNotification(notification: PaymentNotification): Promise<void> {
    console.log('[Agent] Payment notification:', notification);
  }
}
