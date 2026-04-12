import { Schema, Document } from 'mongoose';
import type { Types } from 'mongoose';

export interface UserApiKeyDocument extends Document {
  _id: Types.ObjectId;
  userId: string;
  name: string;              // User-provided label (e.g., "My Script", "CI/CD")
  keyHash: string;           // SHA-256 hash of the key
  prefix: string;            // First 12 chars for display (e.g., "wusu_abcd...")
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date | null;    // Optional expiration
}

export const UserApiKeySchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    keyHash: { type: String, required: true, unique: true },
    prefix: { type: String, required: true },
    lastUsedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'user_api_keys' }
);

UserApiKeySchema.index({ userId: 1, revokedAt: 1 });
UserApiKeySchema.index({ keyHash: 1, revokedAt: 1 });
