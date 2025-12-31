import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Admin document interface
 */
export interface IAdmin extends Document {
  email: string;
  passwordHash: string;
  createdAt: Date;
}

/**
 * Admin schema definition
 */
const adminSchema = new Schema<IAdmin>(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false, // Don't include passwordHash in queries by default
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false, // We're manually managing createdAt
    collection: 'admins',
  }
);

// Create indexes
adminSchema.index({ email: 1 }, { unique: true });

/**
 * Admin model
 */
const Admin: Model<IAdmin> = mongoose.models.Admin || mongoose.model<IAdmin>('Admin', adminSchema);

export default Admin;

