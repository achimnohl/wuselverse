import { Document, Schema, model } from 'mongoose';
import type { Types } from 'mongoose';

export interface UserSessionDocument extends Document {
  _id: Types.ObjectId;
  userId: string;
  sessionHash: string;
  expiresAt: Date;
  lastUsedAt?: Date;
  userAgent?: string;
  ipAddress?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const UserSessionSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    sessionHash: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
    lastUsedAt: { type: Date, default: null },
    userAgent: { type: String, default: null },
    ipAddress: { type: String, default: null },
  },
  {
    timestamps: true,
    collection: 'user_sessions',
  }
);

UserSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const UserSessionModel = model<UserSessionDocument>('UserSession', UserSessionSchema);
