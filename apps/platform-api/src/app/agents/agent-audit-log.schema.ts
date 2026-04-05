import { Schema, Document } from 'mongoose';
import type { Types } from 'mongoose';

export type AuditAction = 'created' | 'updated' | 'deleted' | 'key_rotated';

export interface AgentAuditLogDocument extends Document {
  _id: Types.ObjectId;
  agentId: string;
  action: AuditAction;
  changedFields: string[];
  previousValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
  actorId: string;
  sessionId: string | null;
  timestamp: Date;
}

export const AgentAuditLogSchema = new Schema(
  {
    agentId: { type: String, required: true, index: true },
    action: {
      type: String,
      required: true,
      enum: ['created', 'updated', 'deleted', 'key_rotated'],
    },
    changedFields: [String],
    previousValues: { type: Schema.Types.Mixed, default: {} },
    newValues: { type: Schema.Types.Mixed, default: {} },
    actorId: { type: String, required: true },
    sessionId: { type: String, default: null },
    timestamp: { type: Date, default: () => new Date() },
  },
  { collection: 'agent_audit_logs' }
);
