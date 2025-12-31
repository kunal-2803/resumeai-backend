import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * User document interface
 */
export interface IUser extends Document {
  email: string;
  passwordHash: string;
  createdAt: Date;
}

/**
 * User schema definition
 */
const userSchema = new Schema<IUser>(
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
    collection: 'users',
  }
);

// Create indexes
userSchema.index({ email: 1 }, { unique: true });

/**
 * User model
 */
const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>('User', userSchema);

export default User;

