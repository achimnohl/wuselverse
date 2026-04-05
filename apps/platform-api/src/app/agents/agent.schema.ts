import { Schema, model, Document } from 'mongoose';
import { Agent, AgentStatus } from '@wuselverse/contracts';
import type { Types } from 'mongoose';

export interface AgentDocument extends Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>, Document {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CapabilityInputSchema = new Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ['string', 'number', 'boolean', 'object', 'array'], required: true },
  required: { type: Boolean, required: true },
  description: { type: String, required: true }
}, { _id: false });

const CapabilityOutputSchema = new Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ['string', 'number', 'boolean', 'object', 'array'], required: true },
  description: { type: String, required: true }
}, { _id: false });

const CapabilitySchema = new Schema({
  skill: { type: String, required: true, index: true },
  description: { type: String, required: true },
  inputs: [CapabilityInputSchema],
  outputs: [CapabilityOutputSchema],
  estimatedDuration: Number,
  successRate: Number
}, { _id: false });

const OutcomePricingSchema = new Schema({
  outcome: { type: String, required: true },
  multiplier: { type: Number, required: true }
}, { _id: false });

const AgentPricingSchema = new Schema({
  type: { type: String, enum: ['fixed', 'hourly', 'outcome-based'], required: true },
  amount: { type: Number, required: true },
  currency: { type: String, required: true },
  outcomes: [OutcomePricingSchema]
}, { _id: false });

const ReputationSchema = new Schema({
  score: { type: Number, default: 0, min: 0, max: 100 },
  totalJobs: { type: Number, default: 0 },
  successfulJobs: { type: Number, default: 0 },
  failedJobs: { type: Number, default: 0 },
  averageResponseTime: { type: Number, default: 0 },
  reviews: [Schema.Types.Mixed]
}, { _id: false });

export const AgentSchema = new Schema(
  {
    name: { type: String, required: true, index: true },
    description: { type: String, required: true },
    offerDescription: { type: String, required: true },
    userManual: { type: String, required: true },
    owner: { type: String, required: true, index: true },
    capabilities: { type: [CapabilitySchema], required: true },
    pricing: { type: AgentPricingSchema, required: true },
    reputation: { type: ReputationSchema, required: true },
    status: {
      type: String,
      enum: Object.values(AgentStatus),
      default: AgentStatus.ACTIVE
    },
    rating: { type: Number, default: null, min: 1, max: 5 },
    successCount: { type: Number, default: 0 },
    mcpEndpoint: String,
    githubAppId: Number,
    a2aEndpoint: String,
    manifestUrl: String,
    metadata: { type: Schema.Types.Mixed, default: {} }
  },
  { 
    timestamps: true,
    collection: 'agents'
  }
);

// Indexes for common queries
AgentSchema.index({ owner: 1, status: 1 });
AgentSchema.index({ 'capabilities.skill': 1, status: 1 });
AgentSchema.index({ 'reputation.score': -1 });

export const AgentModel = model<AgentDocument>('Agent', AgentSchema);
