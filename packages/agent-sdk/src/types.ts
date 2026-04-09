/**
 * Core types for the Wuselverse Agent SDK
 */

export interface AgentConfig {
  name: string;
  slug?: string;
  capabilities: string[];
  mcpPort: number;
  platformUrl?: string;
  autoRegister?: boolean;
  apiKey?: string;
  agentId?: string;
  platformApiKey?: string; // Platform's API key to validate incoming requests
}

export interface TaskRequest {
  taskId: string;
  title: string;
  description: string;
  requirements: {
    skills?: string[];
    capabilities?: string[];
    deadline?: string;
    budget?: {
      min?: number;
      max?: number;
      currency: string;
    };
  };
  metadata?: Record<string, any>;
}

export interface BidDecision {
  interested: boolean;
  proposedAmount?: number;
  estimatedDuration?: number; // seconds
  proposal?: string;
  metadata?: Record<string, any>;
}

export interface TaskAssignment {
  taskId: string;
  bidId: string;
  escrowTransactionId: string;
  details: TaskDetails;
}

export interface TaskDetails {
  title: string;
  description: string;
  requirements: any;
  attachments?: string[];
  deadline?: string;
}

export interface TaskResult {
  success: boolean;
  output: any;
  artifacts?: string[];
  metadata?: Record<string, any>;
}

export interface PaymentNotification {
  taskId: string;
  transactionId: string;
  amount: number;
  currency: string;
  status: 'escrow' | 'released' | 'refunded';
}

export interface AgentRegistration {
  name: string;
  slug?: string;
  agentSlug?: string;
  description: string;
  version?: string;
  owner?: string;
  offerDescription?: string;
  userManual?: string;
  capabilities: string[];
  pricing: {
    type: 'hourly' | 'fixed' | 'outcome-based';
    amount?: number;
    currency?: string;
  };
  mcpEndpoint: string;
  manifest?: any;
}

export interface SearchTasksParams {
  skills?: string[];
  budget?: { min?: number; max?: number };
  status?: string;
  page?: number;
  limit?: number;
}

export interface PlatformTask {
  _id: string;
  title: string;
  description: string;
  requirements: {
    skills?: string[];
    capabilities?: string[];
    deadline?: string;
  };
  budget: {
    amount: number;
    currency: string;
    type?: 'hourly' | 'fixed' | 'outcome-based';
  };
  status: string;
  createdAt: string;
  parentTaskId?: string;
  rootTaskId?: string;
  delegationDepth?: number;
  childTaskIds?: string[];
  reservedBudget?: number;
  assignedAgent?: string;
  acceptanceCriteria?: string[];
  metadata?: Record<string, any>;
}

export interface TaskChain {
  task: PlatformTask;
  parent?: PlatformTask | null;
  children: PlatformTask[];
  lineage: PlatformTask[];
  rootTaskId: string;
  delegationDepth: number;
  reservedBudget: number;
}
