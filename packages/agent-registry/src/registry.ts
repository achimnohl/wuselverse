import type { Agent, Capability, APIResponse } from '@wuselverse/contracts';
import { AgentStatus } from '@wuselverse/contracts';

export class AgentRegistry {
  private agents: Map<string, Agent> = new Map();

  /**
   * Register a new agent in the platform
   */
  async registerAgent(agent: Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>): Promise<APIResponse<Agent>> {
    try {
      const id = this.generateAgentId(agent.name, agent.owner);
      
      // Check for duplicate
      if (this.agents.has(id)) {
        return {
          success: false,
          error: {
            code: 'AGENT_EXISTS',
            message: 'Agent with this ID already exists'
          }
        };
      }

      const newAgent: Agent = {
        ...agent,
        id,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      this.agents.set(id, newAgent);

      return {
        success: true,
        data: newAgent
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'REGISTRATION_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  /**
   * Find agents by capabilities
   */
  async findAgentsByCapability(skill: string, minReputation?: number): Promise<APIResponse<Agent[]>> {
    try {
      const matchingAgents = Array.from(this.agents.values()).filter(agent => {
        const hasCapability = agent.capabilities.some((cap: Capability) => cap.skill === skill);
        const meetsReputation = minReputation === undefined || agent.reputation.score >= minReputation;
        const isAvailable = agent.status === AgentStatus.ACTIVE;
        
        return hasCapability && meetsReputation && isAvailable;
      });

      // Sort by reputation
      matchingAgents.sort((a, b) => b.reputation.score - a.reputation.score);

      return {
        success: true,
        data: matchingAgents
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SEARCH_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  /**
   * Get agent by ID
   */
  async getAgent(agentId: string): Promise<APIResponse<Agent>> {
    const agent = this.agents.get(agentId);
    
    if (!agent) {
      return {
        success: false,
        error: {
          code: 'AGENT_NOT_FOUND',
          message: `Agent with ID ${agentId} not found`
        }
      };
    }

    return {
      success: true,
      data: agent
    };
  }

  /**
   * Update agent status
   */
  async updateAgentStatus(agentId: string, status: AgentStatus): Promise<APIResponse<Agent>> {
    const agent = this.agents.get(agentId);
    
    if (!agent) {
      return {
        success: false,
        error: {
          code: 'AGENT_NOT_FOUND',
          message: `Agent with ID ${agentId} not found`
        }
      };
    }

    agent.status = status;
    agent.updatedAt = new Date();
    this.agents.set(agentId, agent);

    return {
      success: true,
      data: agent
    };
  }

  /**
   * Update agent reputation after job completion
   */
  async updateReputation(
    agentId: string, 
    jobSuccess: boolean, 
    responseTime: number
  ): Promise<APIResponse<Agent>> {
    const agent = this.agents.get(agentId);
    
    if (!agent) {
      return {
        success: false,
        error: {
          code: 'AGENT_NOT_FOUND',
          message: `Agent with ID ${agentId} not found`
        }
      };
    }

    agent.reputation.totalJobs += 1;
    if (jobSuccess) {
      agent.reputation.successfulJobs += 1;
    } else {
      agent.reputation.failedJobs += 1;
    }

    // Update success rate and score
    const successRate = agent.reputation.successfulJobs / agent.reputation.totalJobs;
    agent.reputation.score = Math.round(successRate * 100);

    // Update average response time
    const totalResponseTime = agent.reputation.averageResponseTime * (agent.reputation.totalJobs - 1);
    agent.reputation.averageResponseTime = (totalResponseTime + responseTime) / agent.reputation.totalJobs;

    agent.updatedAt = new Date();
    this.agents.set(agentId, agent);

    return {
      success: true,
      data: agent
    };
  }

  private generateAgentId(name: string, owner: string): string {
    return `agent_${owner}_${name.toLowerCase().replace(/\s+/g, '-')}_${Date.now()}`;
  }
}
