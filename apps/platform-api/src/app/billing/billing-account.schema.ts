import { Document, Schema, model } from 'mongoose';
import type { Types } from 'mongoose';

export interface BillingAccountDocument extends Document {
  _id: Types.ObjectId;
  name: string;
  type: 'individual' | 'organization';
  ownerId: string; // User ID
  balance: number;
  settings: {
    settlementSchedule: 'monthly' | 'weekly' | 'immediate';
    currency: string;
  };
  taxInfo?: {
    taxId?: string;
    country: string;
    region?: string;
    vatNumber?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export const BillingAccountSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { 
      type: String, 
      required: true, 
      enum: ['individual', 'organization'],
      default: 'individual'
    },
    ownerId: { type: String, required: true, index: true },
    balance: { type: Number, default: 0 },
    settings: {
      settlementSchedule: { 
        type: String, 
        enum: ['monthly', 'weekly', 'immediate'],
        default: 'monthly'
      },
      currency: { type: String, default: 'USD' }
    },
    taxInfo: {
      taxId: { type: String },
      country: { type: String },
      region: { type: String },
      vatNumber: { type: String }
    }
  },
  {
    timestamps: true,
    collection: 'billing_accounts'
  }
);

// Indexes
BillingAccountSchema.index({ ownerId: 1 });
BillingAccountSchema.index({ type: 1, createdAt: -1 });

export const BillingAccountModel = model<BillingAccountDocument>('BillingAccount', BillingAccountSchema);
