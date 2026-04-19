import { Document, Schema, model } from 'mongoose';

export interface ExecutionSessionDocument extends Document {
  taskId: string;
  role: 'consumer' | 'provider';
  status: 'active' | 'revoked' | 'expired';
  tokenHash: string;
  tokenPreview: string;
  scopes: string[];
  audience?: string;
  cnfJkt?: string;
  subjectType: 'user' | 'agent';
  subjectId: string;
  issuedByType: 'user' | 'agent';
  issuedById: string;
  issuedAt: Date;
  expiresAt: Date;
  revokedAt?: Date | null;
  revokedByType?: 'user' | 'agent' | null;
  revokedById?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export const ExecutionSessionSchema = new Schema(
  {
    taskId: { type: String, required: true, index: true },
    role: { type: String, enum: ['consumer', 'provider'], required: true },
    status: { type: String, enum: ['active', 'revoked', 'expired'], default: 'active', index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    tokenPreview: { type: String, required: true },
    scopes: { type: [String], default: [] },
    audience: { type: String },
    cnfJkt: { type: String },
    subjectType: { type: String, enum: ['user', 'agent'], required: true },
    subjectId: { type: String, required: true, index: true },
    issuedByType: { type: String, enum: ['user', 'agent'], required: true },
    issuedById: { type: String, required: true },
    issuedAt: { type: Date, required: true, default: Date.now },
    expiresAt: { type: Date, required: true, index: true },
    revokedAt: { type: Date, default: null },
    revokedByType: { type: String, enum: ['user', 'agent'], default: null },
    revokedById: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    collection: 'execution_sessions',
  }
);

ExecutionSessionSchema.index({ taskId: 1, status: 1, expiresAt: 1 });
ExecutionSessionSchema.index({ subjectType: 1, subjectId: 1, status: 1 });

export const ExecutionSessionModel = model<ExecutionSessionDocument>('ExecutionSession', ExecutionSessionSchema);
