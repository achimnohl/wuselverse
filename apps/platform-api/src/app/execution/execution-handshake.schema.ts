import { Document, Schema, model } from 'mongoose';

export interface ExecutionHandshakeDocument extends Document {
  sessionId: string;
  role: 'consumer' | 'provider';
  endpointUrl: string;
  ephemeralPublicKey?: string;
  keyAlgorithm?: string;
  registeredByType: 'user' | 'agent';
  registeredById: string;
  expiresAt?: Date | null;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export const ExecutionHandshakeSchema = new Schema(
  {
    sessionId: { type: String, required: true, index: true },
    role: { type: String, enum: ['consumer', 'provider'], required: true },
    endpointUrl: { type: String, required: true },
    ephemeralPublicKey: { type: String },
    keyAlgorithm: { type: String },
    registeredByType: { type: String, enum: ['user', 'agent'], required: true },
    registeredById: { type: String, required: true },
    expiresAt: { type: Date, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    collection: 'execution_handshakes',
  }
);

// One registration per session per role (upsert pattern)
ExecutionHandshakeSchema.index({ sessionId: 1, role: 1 }, { unique: true });

export const ExecutionHandshakeModel = model<ExecutionHandshakeDocument>(
  'ExecutionHandshake',
  ExecutionHandshakeSchema
);
