import { Document, Schema, model } from 'mongoose';
import type { Types } from 'mongoose';

export interface UserDocument extends Document {
  _id: Types.ObjectId;
  email: string;
  displayName: string;
  passwordHash: string;
  roles: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    displayName: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
    roles: { type: [String], default: ['user'] },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    collection: 'users',
  }
);

UserSchema.index({ email: 1 }, { unique: true });

export const UserModel = model<UserDocument>('User', UserSchema);
