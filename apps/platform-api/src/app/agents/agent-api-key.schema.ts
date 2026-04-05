import { Schema, Document } from 'mongoose';
import type { Types } from 'mongoose';

export interface AgentApiKeyDocument extends Document {
  _id: Types.ObjectId;
  agentId: string;
  keyHash: string;
  owner: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

export const AgentApiKeySchema = new Schema(
  {
    agentId: { type: String, required: true, index: true },
    keyHash: { type: String, required: true, unique: true },
    owner: { type: String, required: true, index: true },
    lastUsedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'agent_api_keys' }
);
