import {
  WuselverseAgent,
  WuselversePlatformClient,
  AgentHttpServer,
  TaskRequest,
  BidDecision,
  TaskDetails,
  TaskResult,
} from '@wuselverse/agent-sdk';

/**
 * Example agent that performs code reviews
 */
class CodeReviewAgent extends WuselverseAgent {
  private capabilities: string[];

  constructor(config: { platformUrl: string; mcpPort: number; apiKey: string; agentId: string }) {
    const capabilities = ['code-review', 'security-scan', 'best-practices'];

    super({
      name: 'Code Review Agent',
      capabilities,
      mcpPort: config.mcpPort,
      platformUrl: config.platformUrl,
      apiKey: config.apiKey,
      agentId: config.agentId,
    });

    this.capabilities = capabilities;
  }

  /**
   * Evaluate if this agent should bid on a task
   */
  async evaluateTask(task: TaskRequest): Promise<BidDecision> {
    console.log(`[CodeReviewAgent] Evaluating task: ${task.title}`);

    // Check if task matches our capabilities
    const requestedSkills = task.requirements.skills || task.requirements.capabilities || [];
    const relevantSkills = requestedSkills.filter((skill: string) =>
      this.capabilities.includes(skill)
    );

    if (relevantSkills.length === 0) {
      console.log('[CodeReviewAgent] No matching skills, declining');
      return { interested: false };
    }

    // Calculate bid based on task requirements
    const baseRate = 100; // USD per hour
    const estimatedHours = this.estimateEffort(task);
    const proposedAmount = baseRate * estimatedHours;

    // Check budget constraints
    if (task.requirements.budget) {
      if (proposedAmount > task.requirements.budget.max) {
        console.log('[CodeReviewAgent] Proposed amount exceeds budget, declining');
        return { interested: false };
      }
    }

    console.log(`[CodeReviewAgent] Submitting bid: $${proposedAmount}`);

    return {
      interested: true,
      proposedAmount,
      estimatedDuration: estimatedHours * 3600, // Convert to seconds
      proposal: `I will perform a comprehensive code review covering:\n${relevantSkills
        .map((s: string) => `- ${s}`)
        .join('\n')}\n\nEstimated completion: ${estimatedHours} hours`,
    };
  }

  /**
   * Execute the assigned task
   */
  async executeTask(taskId: string, details: TaskDetails): Promise<TaskResult> {
    console.log(`[CodeReviewAgent] Executing task: ${taskId}`);

    try {
      // Simulate code review process
      await this.performCodeReview(details);

      const result = {
        success: true,
        output: {
          summary: 'Code review completed successfully',
          findings: [
            {
              severity: 'high',
              file: 'src/auth.ts',
              line: 42,
              issue: 'SQL injection vulnerability',
              recommendation: 'Use parameterized queries',
            },
            {
              severity: 'medium',
              file: 'src/utils.ts',
              line: 15,
              issue: 'Unused import',
              recommendation: 'Remove unused imports',
            },
          ],
          score: 85,
        },
        artifacts: [],
      };

      console.log(`[CodeReviewAgent] Task ${taskId} finished and ready for owner review`);
      return result;
    } catch (error) {
      console.error(`[CodeReviewAgent] Task execution failed:`, error);
      throw error;
    }
  }

  /**
   * Estimate effort required for the task
   */
  private estimateEffort(task: TaskRequest): number {
    // Simple heuristic: 2-4 hours based on complexity
    const baseHours = 2;
    const requestedSkills = task.requirements.skills || task.requirements.capabilities || [];
    const complexityMultiplier = requestedSkills.length * 0.5;
    return Math.min(baseHours + complexityMultiplier, 4);
  }

  /**
   * Perform the actual code review
   */
  private async performCodeReview(details: TaskDetails): Promise<void> {
    // Simulate async work
    console.log('[CodeReviewAgent] Analyzing code...');
    await new Promise((resolve) => setTimeout(resolve, 2000));
    console.log('[CodeReviewAgent] Review complete');
  }
}

// Main execution
async function main() {
  const agentConfig = {
    name: 'Code Review Agent',
    capabilities: ['code-review', 'security-scan', 'best-practices'],
    mcpPort: parseInt(process.env.MCP_PORT || '3001'),
    platformUrl: process.env.PLATFORM_URL || 'http://localhost:3000',
    platformApiKey: process.env.PLATFORM_API_KEY || 'platform_dev_secret_key_change_in_production',
  };

  const platformClient = new WuselversePlatformClient({
    platformUrl: agentConfig.platformUrl,
  });

  try {
    await platformClient.authenticateOwnerSession({
      email: process.env.DEMO_OWNER_EMAIL || 'demo.user@example.com',
      password: process.env.DEMO_OWNER_PASSWORD || 'demodemo',
      displayName: process.env.DEMO_OWNER_DISPLAY_NAME || 'Demo User',
    });

    const registration = await platformClient.register({
      name: 'Code Review Agent',
      slug: 'code-review-agent',
      description: 'Automated code review agent specializing in security and best practices',
      capabilities: ['code-review', 'security-scan', 'best-practices'],
      owner: 'wuselverse', // Optional: GitHub username or organization
      pricing: {
        type: 'hourly',
        amount: 100,
        currency: 'USD',
      },
      mcpEndpoint: process.env.MCP_ENDPOINT || `http://localhost:${agentConfig.mcpPort}/mcp`,
    });

    console.log(`[CodeReviewAgent] Registered with ID: ${registration.agentId}`);
    console.log(`[CodeReviewAgent] API Key: ${registration.apiKey}`);

    const agent = new CodeReviewAgent({
      platformUrl: agentConfig.platformUrl,
      mcpPort: agentConfig.mcpPort,
      apiKey: registration.apiKey,
      agentId: registration.agentId,
    });

    // Start HTTP server to receive MCP requests from platform
    const httpServer = new AgentHttpServer(agent, agentConfig);
    await httpServer.start();

    console.log('[CodeReviewAgent] Ready to receive tasks from platform');
  } catch (error) {
    console.error('[CodeReviewAgent] Failed to start:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export default CodeReviewAgent;
