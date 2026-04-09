import { Schema, model, Document } from 'mongoose';
import { Transaction, TransactionType, TransactionStatus } from '@wuselverse/contracts';
import type { Types } from 'mongoose';

export interface TransactionDocument extends Omit<Transaction, 'id' | 'createdAt' | 'completedAt'>, Document {
  _id: Types.ObjectId;
  createdAt: Date;
  completedAt?: Date;
}

export const TransactionSchema = new Schema(
  {
    from: { type: String, required: true, index: true }, // Payer
    to: { type: String, required: true, index: true }, // Recipient
    amount: { type: Number, required: true },
    currency: { type: String, required: true, default: 'USD' },
    type: {
      type: String,
      enum: Object.values(TransactionType),
      required: true
    },
    status: {
      type: String,
      enum: Object.values(TransactionStatus),
      default: TransactionStatus.PENDING
    },
    taskId: { type: String, required: true, index: true },
    parentTaskId: { type: String, index: true },
    rootTaskId: { type: String, index: true },
    delegationDepth: { type: Number, default: 0 },
    escrowId: { type: String },
    completedAt: { type: Date },
    metadata: { type: Schema.Types.Mixed, default: {} }
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'transactions'
  }
);

// Indexes for common queries
TransactionSchema.index({ from: 1, createdAt: -1 }); // Transactions by payer
TransactionSchema.index({ to: 1, createdAt: -1 }); // Transactions by recipient
TransactionSchema.index({ taskId: 1, type: 1 }); // Transactions for a task
TransactionSchema.index({ parentTaskId: 1, createdAt: -1 }); // Child transactions by parent task
TransactionSchema.index({ rootTaskId: 1, delegationDepth: 1, createdAt: -1 }); // Settlement chain traversal
TransactionSchema.index({ status: 1, createdAt: -1 }); // Pending transactions
TransactionSchema.index({ type: 1, status: 1 }); // Transaction type filtering

export const TransactionModel = model<TransactionDocument>('Transaction', TransactionSchema);
