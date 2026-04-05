import type { Task, Bid, APIResponse } from '@wuselverse/contracts';
import { TaskStatus } from '@wuselverse/contracts';
import type { AgentRegistry } from '@wuselverse/agent-registry';

export class Marketplace {
  private tasks: Map<string, Task> = new Map();
  private agentRegistry: AgentRegistry;

  constructor(agentRegistry: AgentRegistry) {
    this.agentRegistry = agentRegistry;
  }

  /**
   * Post a new task to the marketplace
   */
  async postTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'bids' | 'childTaskIds' | 'status'>): Promise<APIResponse<Task>> {
    try {
      const id = this.generateTaskId();
      
      const newTask: Task = {
        ...task,
        id,
        status: TaskStatus.OPEN,
        bids: [],
        childTaskIds: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      this.tasks.set(id, newTask);

      return {
        success: true,
        data: newTask
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'TASK_POST_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  /**
   * Submit a bid for a task
   */
  async submitBid(taskId: string, bid: Omit<Bid, 'id' | 'timestamp' | 'status'>): Promise<APIResponse<Bid>> {
    const task = this.tasks.get(taskId);
    
    if (!task) {
      return {
        success: false,
        error: {
          code: 'TASK_NOT_FOUND',
          message: `Task with ID ${taskId} not found`
        }
      };
    }

    if (task.status !== TaskStatus.OPEN && task.status !== TaskStatus.BIDDING) {
      return {
        success: false,
        error: {
          code: 'BIDDING_CLOSED',
          message: 'This task is no longer accepting bids'
        }
      };
    }

    // Verify agent exists and is active
    const agentResponse = await this.agentRegistry.getAgent(bid.agentId);
    if (!agentResponse.success || !agentResponse.data) {
      return {
        success: false,
        error: {
          code: 'INVALID_AGENT',
          message: 'Agent not found or inactive'
        }
      };
    }

    const newBid: Bid = {
      ...bid,
      id: this.generateBidId(),
      timestamp: new Date(),
      status: 'pending'
    };

    task.bids.push(newBid);
    task.status = TaskStatus.BIDDING;
    task.updatedAt = new Date();
    this.tasks.set(taskId, task);

    return {
      success: true,
      data: newBid
    };
  }

  /**
   * Accept a bid and assign the task
   */
  async acceptBid(taskId: string, bidId: string): Promise<APIResponse<Task>> {
    const task = this.tasks.get(taskId);
    
    if (!task) {
      return {
        success: false,
        error: {
          code: 'TASK_NOT_FOUND',
          message: `Task with ID ${taskId} not found`
        }
      };
    }

    const bid = task.bids.find(b => b.id === bidId);
    if (!bid) {
      return {
        success: false,
        error: {
          code: 'BID_NOT_FOUND',
          message: `Bid with ID ${bidId} not found`
        }
      };
    }

    // Update bid statuses
    task.bids = task.bids.map(b => ({
      ...b,
      status: b.id === bidId ? 'accepted' : 'rejected'
    }));

    task.assignedAgent = bid.agentId;
    task.status = TaskStatus.ASSIGNED;
    task.updatedAt = new Date();
    this.tasks.set(taskId, task);

    return {
      success: true,
      data: task
    };
  }

  /**
   * Match tasks with suitable agents automatically
   */
  async matchTask(taskId: string): Promise<APIResponse<string[]>> {
    const task = this.tasks.get(taskId);
    
    if (!task) {
      return {
        success: false,
        error: {
          code: 'TASK_NOT_FOUND',
          message: `Task with ID ${taskId} not found`
        }
      };
    }

    // Find agents for each required capability
    const matchedAgentIds = new Set<string>();
    
    for (const capability of task.requirements.capabilities) {
      const agentsResponse = await this.agentRegistry.findAgentsByCapability(
        capability,
        task.requirements.minReputation
      );
      
      if (agentsResponse.success && agentsResponse.data) {
        agentsResponse.data.forEach(agent => matchedAgentIds.add(agent.id));
      }
    }

    const agents = Array.from(matchedAgentIds);

    return {
      success: true,
      data: agents
    };
  }

  /**
   * Get task by ID
   */
  async getTask(taskId: string): Promise<APIResponse<Task>> {
    const task = this.tasks.get(taskId);
    
    if (!task) {
      return {
        success: false,
        error: {
          code: 'TASK_NOT_FOUND',
          message: `Task with ID ${taskId} not found`
        }
      };
    }

    return {
      success: true,
      data: task
    };
  }

  /**
   * Update task status
   */
  async updateTaskStatus(taskId: string, status: TaskStatus): Promise<APIResponse<Task>> {
    const task = this.tasks.get(taskId);
    
    if (!task) {
      return {
        success: false,
        error: {
          code: 'TASK_NOT_FOUND',
          message: `Task with ID ${taskId} not found`
        }
      };
    }

    task.status = status;
    task.updatedAt = new Date();
    this.tasks.set(taskId, task);

    return {
      success: true,
      data: task
    };
  }

  /**
   * Find open tasks that an agent can bid on
   */
  async findOpenTasksForAgent(agentId: string): Promise<APIResponse<Task[]>> {
    const agentResponse = await this.agentRegistry.getAgent(agentId);
    
    if (!agentResponse.success || !agentResponse.data) {
      return {
        success: false,
        error: {
          code: 'AGENT_NOT_FOUND',
          message: `Agent with ID ${agentId} not found`
        }
      };
    }

    const agent = agentResponse.data;
    const agentSkills = agent.capabilities.map(c => c.skill);

    const matchingTasks = Array.from(this.tasks.values()).filter(task => {
      if (task.status !== TaskStatus.OPEN && task.status !== TaskStatus.BIDDING) {
        return false;
      }

      // Check if agent has required capabilities
      const hasCapabilities = task.requirements.capabilities.every(
        req => agentSkills.includes(req)
      );

      // Check reputation requirement
      const meetsReputation = !task.requirements.minReputation || 
        agent.reputation.score >= task.requirements.minReputation;

      return hasCapabilities && meetsReputation;
    });

    return {
      success: true,
      data: matchingTasks
    };
  }

  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateBidId(): string {
    return `bid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
