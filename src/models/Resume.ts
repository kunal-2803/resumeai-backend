import mongoose, { Schema, Document, Model } from 'mongoose';
import { ResumeData } from './types';

/**
 * Resume status enum
 */
export enum ResumeStatus {
  DRAFT = 'draft',
  PARSED = 'parsed',
  GENERATED = 'generated',
  COMPLETED = 'completed',
}

/**
 * Resume document interface
 */
export interface IResume extends Document {
  userId: mongoose.Types.ObjectId;
  resumeData: ResumeData;
  jobDescription: string;
  atsScore?: number;
  status: ResumeStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Resume schema definition
 */
const resumeSchema = new Schema<IResume>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    resumeData: {
      type: Schema.Types.Mixed,
      required: [true, 'Resume data is required'],
    },
    jobDescription: {
      type: String,
      required: [false, 'Job description is not required'],
    },
    atsScore: {
      type: Number,
      min: 0,
      max: 100,
    },
    status: {
      type: String,
      enum: Object.values(ResumeStatus),
      default: ResumeStatus.DRAFT,
    },
  },
  {
    timestamps: true,
    collection: 'resumes',
  }
);

// Create indexes
resumeSchema.index({ userId: 1, createdAt: -1 });
resumeSchema.index({ userId: 1, status: 1 });

/**
 * Resume model
 */
const Resume: Model<IResume> = mongoose.models.Resume || mongoose.model<IResume>('Resume', resumeSchema);

export default Resume;

