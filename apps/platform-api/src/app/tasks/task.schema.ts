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
    result: Schema.Types.Mixed,
    completedAt: Date,
    parentTaskId: String,
    childTaskIds: [String],
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

export const TaskModel = model<TaskDocument>('Task', TaskSchema);
