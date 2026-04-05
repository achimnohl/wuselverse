import { Schema, model, Document } from 'mongoose';
import { Review } from '@wuselverse/contracts';
import type { Types } from 'mongoose';

export interface ReviewDocument extends Omit<Review, 'id' | 'timestamp'>, Document {
  _id: Types.ObjectId;
  timestamp: Date;
}

export const ReviewSchema = new Schema(
  {
    from: { type: String, required: true, index: true }, // Agent who hired
    to: { type: String, required: true, index: true }, // Agent who delivered
    taskId: { type: String, required: true, index: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String },
    verified: { type: Boolean, default: true } // Only verified agents can submit reviews
  },
  {
    timestamps: { createdAt: 'timestamp', updatedAt: false },
    collection: 'reviews'
  }
);

// Indexes for common queries
ReviewSchema.index({ to: 1, timestamp: -1 }); // Get reviews for an agent
ReviewSchema.index({ from: 1, timestamp: -1 }); // Get reviews by an agent
ReviewSchema.index({ taskId: 1 }, { unique: true }); // One review per task
ReviewSchema.index({ to: 1, rating: -1 }); // Get top-rated reviews

export const ReviewModel = model<ReviewDocument>('Review', ReviewSchema);
