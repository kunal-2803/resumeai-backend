import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * OpenAI usage document interface
 */
export interface IOpenAIUsage extends Document {
  userId: mongoose.Types.ObjectId;
  operation: string; // e.g., 'parseResume', 'generateResume', 'improveSection', 'calculateATSScore'
  model: string; // e.g., 'gpt-4o-mini', 'gpt-4'
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number; // Cost in USD
  currency: string; // Default: 'USD'
  metadata?: {
    resumeId?: string;
    jobDescription?: string;
    sectionType?: string;
    [key: string]: any;
  };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * OpenAI usage schema definition
 */
const openAIUsageSchema = new Schema<IOpenAIUsage>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    operation: {
      type: String,
      required: [true, 'Operation type is required'],
      index: true,
    },
    model: {
      type: String,
      required: [true, 'Model name is required'],
      index: true,
    },
    promptTokens: {
      type: Number,
      required: [true, 'Prompt tokens is required'],
      min: 0,
    },
    completionTokens: {
      type: Number,
      required: [true, 'Completion tokens is required'],
      min: 0,
    },
    totalTokens: {
      type: Number,
      required: [true, 'Total tokens is required'],
      min: 0,
    },
    cost: {
      type: Number,
      required: [true, 'Cost is required'],
      min: 0,
    },
    currency: {
      type: String,
      default: 'USD',
      required: [true, 'Currency is required'],
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: 'openai_usage',
  }
);

// Create indexes
openAIUsageSchema.index({ userId: 1, createdAt: -1 });
openAIUsageSchema.index({ userId: 1, operation: 1 });
openAIUsageSchema.index({ createdAt: -1 });
openAIUsageSchema.index({ model: 1 });

/**
 * OpenAI usage model
 */
const OpenAIUsage: Model<IOpenAIUsage> =
  mongoose.models.OpenAIUsage || mongoose.model<IOpenAIUsage>('OpenAIUsage', openAIUsageSchema);

export default OpenAIUsage;

