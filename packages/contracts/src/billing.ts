export interface BillingAccount {
  id: string;
  name: string;
  type: BillingAccountType;
  ownerId: string; // User ID of the account owner
  balance: number; // Virtual balance (positive = receivable, negative = payable)
  settings: BillingAccountSettings;
  taxInfo?: TaxInformation;
  createdAt: Date;
  updatedAt: Date;
}

export enum BillingAccountType {
  INDIVIDUAL = 'individual',
  ORGANIZATION = 'organization'
}

export interface BillingAccountSettings {
  settlementSchedule: SettlementSchedule;
  currency: string; // Default: USD
}

export enum SettlementSchedule {
  MONTHLY = 'monthly',
  WEEKLY = 'weekly',
  IMMEDIATE = 'immediate' // For backward compatibility
}

export interface TaxInformation {
  taxId?: string; // EIN or SSN (encrypted)
  country: string;
  region?: string; // State/province
  vatNumber?: string; // For EU businesses
}

export interface BillingAccountMember {
  id: string;
  billingAccountId: string;
  userId: string;
  role: BillingRole;
  addedAt: Date;
  addedBy: string;
}

export enum BillingRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
  VIEWER = 'viewer'
}

export interface SettlementTransaction {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  netAmount: number;
  currency: string;
  period: string; // YYYY-MM format
  sourceTransactionIds: string[]; // Original transaction IDs that were netted
  method: SettlementMethod;
  status: TransactionSettlementStatus;
  createdAt: Date;
  settledAt?: Date;
  metadata: Record<string, unknown>;
}

export enum SettlementMethod {
  VIRTUAL = 'virtual', // Internal/netted, no real money movement
  MANUAL = 'manual', // Manual admin intervention
  STRIPE = 'stripe', // Future: Stripe Connect
  CRYPTO = 'crypto', // Future: Crypto payment
  WIRE = 'wire' // Future: Wire transfer
}

export enum TransactionSettlementStatus {
  PENDING = 'pending',
  NETTED_INTERNAL = 'netted_internal', // Same account, no payment needed
  NETTED_BILATERAL = 'netted_bilateral', // Offset against reverse flow
  SETTLED = 'settled', // Virtual settlement complete
  PAID = 'paid', // Real payment processed (future)
  FAILED = 'failed' // Payment failed (future)
}

export interface Invoice {
  id: string;
  accountId: string;
  period: string; // YYYY-MM format
  lineItems: InvoiceLineItem[];
  totalEarned: number;
  totalSpent: number;
  nettedInternal: number;
  nettedBilateral: number;
  netAmount: number; // Positive = receivable, negative = payable
  status: InvoiceStatus;
  currency: string;
  issuedAt: Date;
  settledAt?: Date;
  pdfUrl?: string;
}

export enum InvoiceStatus {
  DRAFT = 'draft',
  ISSUED = 'issued',
  SETTLED = 'settled',
  VOID = 'void'
}

export interface InvoiceLineItem {
  type: 'earning' | 'spending' | 'netted_internal' | 'netted_bilateral' | 'fee' | 'credit';
  description: string;
  amount: number;
  transactionIds: string[];
  count: number; // Number of transactions aggregated
}

export interface UsageReport {
  accountId: string;
  period: string; // YYYY-MM format
  tasksPosted: number;
  tasksCompleted: number;
  tasksAsPoster: number;
  tasksAsAssignee: number;
  delegatedTasks: number;
  totalEarnings: number;
  totalSpending: number;
  escrowVolume: number;
  nettingEfficiency: number; // Percentage of transactions netted vs. settled
  agentBreakdown: AgentUsageBreakdown[];
  reputationChanges: ReputationChange[];
  disputeRate: number;
  generatedAt: Date;
}

export interface AgentUsageBreakdown {
  agentId: string;
  agentName: string;
  tasksCompleted: number;
  earnings: number;
  averageRating: number;
}

export interface ReputationChange {
  agentId: string;
  agentName: string;
  previousRating: number;
  currentRating: number;
  change: number;
}
