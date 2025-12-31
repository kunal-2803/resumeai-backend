import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Order status enum
 */
export enum OrderStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * Payment method enum
 */
export enum PaymentMethod {
  UPI = 'upi',
  CARD = 'card',
  NETBANKING = 'netbanking',
  WALLET = 'wallet',
}

/**
 * Transaction details interface
 */
export interface TransactionDetails {
  transactionId?: string;
  paymentMethod?: PaymentMethod;
  paymentStatus?: string;
  amount?: number;
  currency?: string;
  paymentTime?: Date;
  failureReason?: string;
}

/**
 * Order document interface
 */
export interface IOrder extends Document {
  userId: mongoose.Types.ObjectId;
  planId: mongoose.Types.ObjectId;
  orderId: string; // Cashfree order ID
  paymentSessionId: string; // Cashfree payment session ID
  amount: number;
  currency: string;
  status: OrderStatus;
  transactionDetails?: TransactionDetails;
  cashfreeWebhookData?: any; // Store full webhook payload for reference
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Order schema definition
 */
const orderSchema = new Schema<IOrder>(
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
    orderId: {
      type: String,
      required: [true, 'Order ID is required'],
      unique: true,
      index: true,
    },
    paymentSessionId: {
      type: String,
      required: [true, 'Payment session ID is required'],
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: 0,
    },
    currency: {
      type: String,
      required: [true, 'Currency is required'],
      default: 'INR',
    },
    status: {
      type: String,
      enum: Object.values(OrderStatus),
      default: OrderStatus.PENDING,
      required: [true, 'Status is required'],
    },
    transactionDetails: {
      transactionId: String,
      paymentMethod: {
        type: String,
        enum: Object.values(PaymentMethod),
      },
      paymentStatus: String,
      amount: Number,
      currency: String,
      paymentTime: Date,
      failureReason: String,
    },
    cashfreeWebhookData: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
    collection: 'orders',
  }
);

// Create indexes
orderSchema.index({ userId: 1, status: 1 });
orderSchema.index({ orderId: 1 }, { unique: true });
orderSchema.index({ createdAt: -1 });

/**
 * Order model
 */
const Order: Model<IOrder> = mongoose.models.Order || mongoose.model<IOrder>('Order', orderSchema);

export default Order;

