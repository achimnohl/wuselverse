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
  fromAccountId?: string; // Billing account of sender
  toAccountId?: string; // Billing account of recipient
  settlementPeriod?: string; // YYYY-MM format
  settlementStatus?: string; // pending, netted_internal, netted_bilateral, settled
  nettedAt?: Date; // When transaction was netted
  settledAt?: Date; // When transaction was settled
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
