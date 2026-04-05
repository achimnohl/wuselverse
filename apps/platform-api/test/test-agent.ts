/**
 * Test Agent for E2E Testing
 * A simple agent implementation used for testing the bidding flow
 */

import { WuselverseAgent, AgentHttpServer, WuselversePlatformClient } from '@wuselverse/agent-sdk';

interface TestAgentConfig {
  name: string;
  capabilities: string[];
  mcpPort: number;
  platformUrl: string;
  platformApiKey: string;
  bidAmount?: number;
  shouldBid?: boolean;
}

export class TestAgent extends WuselverseAgent {
  private bidAmount: number;
  private shouldBid: boolean;
  private completedTasks: string[] = [];
  private httpServer: AgentHttpServer | null = null;
  private agentConfig: TestAgentConfig;

  constructor(config: TestAgentConfig) {
    super({
      name: config.name,
      capabilities: config.capabilities,
      mcpPort: config.mcpPort,
      platformUrl: config.platformUrl,
      platformApiKey: config.platformApiKey,
    });
    this.agentConfig = config;
    this.bidAmount = config.bidAmount || 100;
    this.shouldBid = config.shouldBid !== false;
  }

  async evaluateTask(task: any): Promise<any> {
    console.log(`[TestAgent] Evaluating task ${task.id}:`, task.title);
    
    if (!this.shouldBid) {
      return { interested: false };
    }

    // Check if we have matching capabilities
    const hasMatchingCapability = task.requirements?.skills?.some((skill: string) =>
      this.agentConfig.capabilities.includes(skill)
    );

    if (!hasMatchingCapability) {
      console.log(`[TestAgent] No matching capability for task ${task.id}`);
      return { interested: false };
    }

    return {
      interested: true,
      proposedAmount: this.bidAmount,
      estimatedDuration: 3600,
      proposal: `Test agent proposal for task ${task.id}`,
    };
  }

  async executeTask(taskId: string, details: any): Promise<any> {
    console.log(`[TestAgent] Executing task ${taskId}:`, details);
    
    // Simulate task execution
    await new Promise(resolve => setTimeout(resolve, 100));
    
    this.completedTasks.push(taskId);
    
    return {
      success: true,
      output: {
        message: `Task ${taskId} completed successfully by ${this.agentConfig.name}`,
        timestamp: new Date().toISOString(),
      },
      artifacts: [],
    };
  }

  async startHttpServer(): Promise<void> {
    this.httpServer = new AgentHttpServer(this, {
      name: this.agentConfig.name,
      capabilities: this.agentConfig.capabilities,
      mcpPort: this.agentConfig.mcpPort,
      platformApiKey: this.agentConfig.platformApiKey,
    });
    await this.httpServer.start();
    console.log(`[TestAgent] HTTP server started on port ${this.agentConfig.mcpPort}`);
  }

  async stopHttpServer(): Promise<void> {
    if (this.httpServer) {
      await this.httpServer.stop();
      this.httpServer = null;
      console.log(`[TestAgent] HTTP server stopped`);
    }
  }

  async registerWithPlatform(apiKey: string): Promise<void> {
    const platformClient = new WuselversePlatformClient({
      platformUrl: this.agentConfig.platformUrl,
      apiKey,
    });

    try {
      await platformClient.register({
        name: this.agentConfig.name,
        capabilities: this.agentConfig.capabilities,
        mcpEndpoint: `http://localhost:${this.agentConfig.mcpPort}`,
        description: 'Test agent for e2e testing',
        version: '1.0.0',
        pricing: {
          type: 'fixed',
          amount: this.bidAmount,
          currency: 'USD',
        },
      });
      console.log(`[TestAgent] Registered with platform successfully`);
    } catch (error) {
      console.error(`[TestAgent] Failed to register with platform:`, error);
      throw error;
    }
  }

  getCompletedTasks(): string[] {
    return this.completedTasks;
  }

  setBidAmount(amount: number): void {
    this.bidAmount = amount;
  }

  setShouldBid(shouldBid: boolean): void {
    this.shouldBid = shouldBid;
  }
}
