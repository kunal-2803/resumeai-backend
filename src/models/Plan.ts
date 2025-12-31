import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Plan type enum
 */
export enum PlanType {
  FREE = 'free',
  PRO = 'pro',
  PREMIUM = 'premium',
}

/**
 * Plan document interface
 */
export interface IPlan extends Document {
  name: string;
  type: PlanType;
  price: number;
  currency: string;
  maxResumes: number;
  maxATSChecks: number;
  features: {
    aiRewriteSuggestions: boolean;
    priorityProcessing: boolean;
    resumeVersions: boolean;
  };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Plan schema definition
 */
const planSchema = new Schema<IPlan>(
  {
    name: {
      type: String,
      required: [true, 'Plan name is required'],
    },
    type: {
      type: String,
      enum: Object.values(PlanType),
      required: [true, 'Plan type is required'],
      unique: true,
    },
    price: {
      type: Number,
      required: [true, 'Plan price is required'],
      min: 0,
    },
    currency: {
      type: String,
      required: [true, 'Currency is required'],
      default: 'INR',
    },
    maxResumes: {
      type: Number,
      required: [true, 'Max resumes is required'],
      min: 0,
    },
    maxATSChecks: {
      type: Number,
      required: [true, 'Max ATS checks is required'],
      min: 0,
    },
    features: {
      aiRewriteSuggestions: {
        type: Boolean,
        default: false,
      },
      priorityProcessing: {
        type: Boolean,
        default: false,
      },
      resumeVersions: {
        type: Boolean,
        default: false,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    collection: 'plans',
  }
);

// Create indexes
planSchema.index({ type: 1 }, { unique: true });
planSchema.index({ isActive: 1 });

/**
 * Plan model
 */
const Plan: Model<IPlan> = mongoose.models.Plan || mongoose.model<IPlan>('Plan', planSchema);

export default Plan;

