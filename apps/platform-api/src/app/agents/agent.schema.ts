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

const ExecutionAuthSchema = new Schema({
  required: { type: Boolean, default: false },
  mode: {
    type: String,
    enum: ['none', 'platform_token', 'external_oauth', 'mtls'],
    default: 'none',
  },
  requiredScopes: { type: [String], default: undefined },
  tokenTtlSeconds: { type: Number, min: 60, max: 3600, default: undefined },
  dpopRequired: { type: Boolean, default: false },
  discoveryUrl: { type: String, default: undefined },
}, { _id: false });

const ClaudeManagedRuntimeSchema = new Schema({
  agentId: { type: String, required: true },
  environmentId: { type: String, required: true },
  // AES-256-GCM encrypted Anthropic API key — never returned in API responses
  anthropicApiKeyEncrypted: { type: String, default: undefined, select: false },
  anthropicModel: { type: String, default: undefined },
  permissionPolicy: {
    type: String,
    enum: ['always_allow', 'always_ask'],
    default: undefined,
  },
  skillIds: { type: [String], default: undefined },
}, { _id: false });

const ChatEndpointRuntimeSchema = new Schema({
  url: { type: String, required: true },
  authType: {
    type: String,
    enum: ['bearer', 'api-key', 'none'],
    default: 'none',
  },
  // AES-256-GCM encrypted credentials — never returned in API responses
  credentialsEncrypted: { type: String, default: undefined, select: false },
  model: { type: String, default: undefined },
  systemPrompt: { type: String, default: undefined },
  parameters: { type: Schema.Types.Mixed, default: undefined },
  customHeaders: { type: Schema.Types.Mixed, default: undefined },
}, { _id: false });

const AutoBiddingConfigSchema = new Schema({
  enabled: { type: Boolean, required: true },
  matchCapabilities: { type: [String], required: true },
  minBudget: { type: Number, default: undefined },
  maxBudget: { type: Number, default: undefined },
  bidPricing: { type: AgentPricingSchema, default: undefined },
}, { _id: false });

export const AgentSchema = new Schema(
  {
    name: { type: String, required: true, index: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
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
    executionAuth: { type: ExecutionAuthSchema, default: { required: false, mode: 'none' } },
    claudeManaged: { type: ClaudeManagedRuntimeSchema, default: undefined },
    chatEndpoint: { type: ChatEndpointRuntimeSchema, default: undefined },
    autoBidding: { type: AutoBiddingConfigSchema, default: undefined },
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
AgentSchema.index(
  { owner: 1, slug: 1 },
  {
    unique: true,
    partialFilterExpression: { slug: { $type: 'string' } },
  }
);
AgentSchema.index({ 'capabilities.skill': 1, status: 1 });
AgentSchema.index({ 'reputation.score': -1 });

export const AgentModel = model<AgentDocument>('Agent', AgentSchema);
