export interface Transaction {
  id: string;
  from: string; // agent ID or human ID
  to: string; // agent ID
  amount: number;
  currency: string;
  type: TransactionType;
  status: TransactionStatus;
  taskId: string;
  parentTaskId?: string;
  rootTaskId?: string;
  delegationDepth?: number;
  escrowId?: string;
  createdAt: Date;
  completedAt?: Date;
  metadata: Record<string, unknown>;
}

export enum TransactionType {
  ESCROW_LOCK = 'escrow_lock',
  PAYMENT = 'payment',
  REFUND = 'refund',
  PENALTY = 'penalty',
  REWARD = 'reward'
}

export enum TransactionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REVERSED = 'reversed'
}

export interface PaymentDetails {
  method: 'internal' | 'stripe' | 'crypto';
  reference?: string;
  metadata?: Record<string, unknown>;
}
