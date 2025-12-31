import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Subscription status enum
 */
export enum SubscriptionStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
}

/**
 * Usage tracking interface
 */
export interface UsageTracking {
  resumes: number;
  atsChecks: number;
}

/**
 * UserSubscription document interface
 */
export interface IUserSubscription extends Document {
  userId: mongoose.Types.ObjectId;
  planId: mongoose.Types.ObjectId;
  status: SubscriptionStatus;
  usage: UsageTracking;
  left: UsageTracking;
  startDate: Date;
  endDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * UserSubscription schema definition
 */
const userSubscriptionSchema = new Schema<IUserSubscription>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    planId: {
      type: Schema.Types.ObjectId,
      ref: 'Plan',
      required: [true, 'Plan ID is required'],
    },
    status: {
      type: String,
      enum: Object.values(SubscriptionStatus),
      default: SubscriptionStatus.ACTIVE,
      required: [true, 'Status is required'],
    },
    usage: {
      resumes: {
        type: Number,
        default: 0,
        min: 0,
      },
      atsChecks: {
        type: Number,
        default: 0,
        min: 0,
      },
    },
    left: {
      resumes: {
        type: Number,
        default: 0,
        min: 0,
      },
      atsChecks: {
        type: Number,
        default: 0,
        min: 0,
      },
    },
    startDate: {
      type: Date,
      default: Date.now,
      required: [true, 'Start date is required'],
    },
    endDate: {
      type: Date,
    },
  },
  {
    timestamps: true,
    collection: 'user_subscriptions',
  }
);

// Create indexes
userSubscriptionSchema.index({ userId: 1, status: 1 });
userSubscriptionSchema.index({ userId: 1, createdAt: -1 });

/**
 * UserSubscription model
 */
const UserSubscription: Model<IUserSubscription> =
  mongoose.models.UserSubscription || mongoose.model<IUserSubscription>('UserSubscription', userSubscriptionSchema);

export default UserSubscription;

