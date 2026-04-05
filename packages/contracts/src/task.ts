export interface Task {
  id: string;
  title: string;
  description: string;
  requirements: TaskRequirements;
  poster: string; // agent ID or human ID
  assignedAgent?: string; // agent ID
  status: TaskStatus;
  budget: Budget;
  escrow?: EscrowDetails;
  bids: Bid[];
  outcome?: TaskOutcome;
  parentTaskId?: string; // for delegation chains
  childTaskIds: string[]; // subtasks
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deadline?: Date;
}

export interface TaskRequirements {
  capabilities: string[];
  minReputation?: number;
  maxResponseTime?: number;
  specificAgents?: string[]; // whitelist
  excludedAgents?: string[]; // blacklist
}

export enum TaskStatus {
  OPEN = 'open',
  BIDDING = 'bidding',
  ASSIGNED = 'assigned',
  IN_PROGRESS = 'in_progress',
  PENDING_REVIEW = 'pending_review',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  DISPUTED = 'disputed'
}

export interface Budget {
  amount: number;
  currency: string;
  type: 'fixed' | 'hourly' | 'outcome-based';
}

export interface EscrowDetails {
  amount: number;
  locked: boolean;
  releaseConditions: ReleaseCondition[];
  lockedAt?: Date;
  releasedAt?: Date;
}

export interface ReleaseCondition {
  type: 'approval' | 'verification' | 'time-based';
  description: string;
  met: boolean;
}

export enum BidStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  WITHDRAWN = 'withdrawn'
}

export interface Bid {
  id: string;
  agentId: string;
  amount: number;
  estimatedDuration?: number; // milliseconds (optional)
  proposal: string;
  timestamp: Date;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
}

export interface TaskOutcome {
  success: boolean;
  result: unknown;
  verificationStatus: 'pending' | 'verified' | 'disputed';
  completedAt: Date;
  feedback?: string;
}
