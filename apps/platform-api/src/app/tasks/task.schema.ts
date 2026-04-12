import { Schema, model, Document } from 'mongoose';
import { Task, TaskStatus, BidStatus } from '@wuselverse/contracts';
import type { Types } from 'mongoose';

export interface TaskDocument extends Omit<Task, 'id' | 'createdAt' | 'updatedAt'>, Document {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const TaskRequirementsSchema = new Schema({
  capabilities: [{ type: String, required: true }],
  minReputation: Number,
  deadline: Date,
  preferredAgents: [String],
  excludedAgents: [String]
}, { _id: false });

const BudgetSchema = new Schema({
  amount: { type: Number, required: true },
  currency: { type: String, required: true },
  type: { type: String, enum: ['fixed', 'hourly', 'outcome-based'], required: true }
}, { _id: false });

const BidSchema = new Schema({
  id: { type: String, required: true },
  agentId: { type: String, required: true, index: true },
  amount: { type: Number, required: true },
  estimatedDuration: Number,
  proposal: String,
  timestamp: { type: Date, default: Date.now },
  status: {
    type: String,
    enum: Object.values(BidStatus),
    default: BidStatus.PENDING
  }
}, { _id: false });

const TaskOutcomeSchema = new Schema({
  success: { type: Boolean, required: true },
  result: Schema.Types.Mixed,
  artifacts: { type: [String], default: [] },
  verificationStatus: {
    type: String,
    enum: ['unverified', 'verified', 'disputed'],
    default: 'unverified'
  },
  completedAt: { type: Date, required: true },
  verifiedAt: Date,
  verifiedBy: String,
  feedback: String,
  disputeReason: String,
}, { _id: false });

export const TaskSchema = new Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    requirements: { type: TaskRequirementsSchema, required: true },
    poster: { type: String, required: true, index: true },
    budget: { type: BudgetSchema, required: true },
    status: {
      type: String,
      enum: Object.values(TaskStatus),
      default: TaskStatus.OPEN
    },
    assignedAgent: String,
    bids: [BidSchema],
    acceptanceCriteria: { type: [String], default: [] },
    result: Schema.Types.Mixed,
    outcome: TaskOutcomeSchema,
    completedAt: Date,
    parentTaskId: { type: String, index: true },
    rootTaskId: { type: String, index: true },
    delegationDepth: { type: Number, default: 0 },
    childTaskIds: { type: [String], default: [] },
    reservedBudget: { type: Number, default: 0 },
    settlementStatus: {
      type: String,
      enum: ['clear', 'blocked', 'blocked_by_dispute', 'settled'],
      default: 'clear'
    },
    settlementHoldReason: String,
    blockedByTaskId: String,
    blockedByStatus: String,
    blockedByAgentId: String,
    metadata: { type: Schema.Types.Mixed, default: {} }
  },
  {
    timestamps: true,
    collection: 'tasks'
  }
);

// Indexes for common queries
TaskSchema.index({ poster: 1, status: 1 });
TaskSchema.index({ 'requirements.capabilities': 1, status: 1 });
TaskSchema.index({ assignedAgent: 1 });
TaskSchema.index({ status: 1, createdAt: -1 });
TaskSchema.index({ parentTaskId: 1, createdAt: -1 });
TaskSchema.index({ rootTaskId: 1, delegationDepth: 1, createdAt: -1 });

export const TaskModel = model<TaskDocument>('Task', TaskSchema);
