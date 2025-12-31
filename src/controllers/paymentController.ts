import { Request, Response } from 'express';
import { Cashfree } from "cashfree-pg";
import mongoose from 'mongoose';
import { Order, OrderStatus, PaymentMethod, User, Plan } from '../models';
import { AuthRequest } from '../middleware/auth';
import subscriptionService from '../services/subscriptionService';

// Cashfree API configuration
const CASHFREE_APP_ID = process.env.CASHFREE_APP_ID;
const CASHFREE_SECRET_KEY = process.env.CASHFREE_SECRET_KEY;
const CASHFREE_ENV = process.env.CASHFREE_ENV || 'sandbox'; // 'sandbox' or 'production'

// Helper function to get Cashfree instance
const getCashfreeInstance = () => {
  if (!CASHFREE_APP_ID || !CASHFREE_SECRET_KEY) {
    throw new Error('Cashfree credentials are not configured');
  }
  
  // Check if Cashfree has Environment constants
  let environment: any;
  if ((Cashfree as any).Environment) {
    environment = CASHFREE_ENV === 'production' 
      ? (Cashfree as any).Environment.PRODUCTION 
      : (Cashfree as any).Environment.SANDBOX;
  } else if ((Cashfree as any).SANDBOX) {
    // Try using SANDBOX/PRODUCTION constants directly
    environment = CASHFREE_ENV === 'production' 
      ? (Cashfree as any).PRODUCTION 
      : (Cashfree as any).SANDBOX;
  } else {
    // Fallback to string values
    environment = CASHFREE_ENV === 'production' ? 'PRODUCTION' : 'SANDBOX';
  }
  
  console.log('Initializing Cashfree with:', {
    environment: environment,
    hasAppId: !!CASHFREE_APP_ID,
    hasSecretKey: !!CASHFREE_SECRET_KEY,
    env: CASHFREE_ENV
  });
  
  return new Cashfree(environment, CASHFREE_APP_ID, CASHFREE_SECRET_KEY);
};

/**
 * Create payment order
 * POST /api/payment/create-order
 */
export const createOrder = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const { planId } = req.body;

    if (!planId) {
      return res.status(400).json({
        success: false,
        error: 'Plan ID is required',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(planId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid plan ID',
      });
    }

    // Validate Cashfree credentials
    if (!CASHFREE_APP_ID || !CASHFREE_SECRET_KEY) {
      console.error('Cashfree credentials missing:', {
        hasAppId: !!CASHFREE_APP_ID,
        hasSecretKey: !!CASHFREE_SECRET_KEY,
        appIdLength: CASHFREE_APP_ID?.length,
        secretKeyLength: CASHFREE_SECRET_KEY?.length
      });
      return res.status(500).json({
        success: false,
        error: 'Payment gateway configuration error - credentials not set',
      });
    }

    // Get Cashfree instance
    let cashfree;
    try {
      cashfree = getCashfreeInstance();
    } catch (error: any) {
      console.error('Failed to initialize Cashfree:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to initialize payment gateway',
      });
    }

    // Get user
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Get plan
    const plan = await Plan.findById(planId);
    if (!plan) {
      return res.status(404).json({
        success: false,
        error: 'Plan not found',
      });
    }

    if (!plan.isActive) {
      return res.status(400).json({
        success: false,
        error: 'Plan is not active',
      });
    }

    // Generate unique order ID
    const orderId = `ORDER_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Prepare order data for Cashfree
    const orderRequest = {
      order_id: orderId,
      order_amount: plan.price,
      order_currency: plan.currency || 'INR',
      order_note: `Subscription to ${plan.name} plan`,
      customer_details: {
        customer_id: req.userId,
        customer_email: user.email,
        customer_phone: '', // Add if available in user model
      },
      order_meta: {
        return_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/plans?order_id={order_id}`,
        notify_url: `${process.env.BACKEND_URL || 'http://localhost:3000'}/api/payment/webhook`,
        payment_methods: 'upi,card', // Enable UPI and Card payments
      },
    };

    // Create order in Cashfree using SDK
    console.log('Creating order with Cashfree:', {
      orderId,
      amount: plan.price,
      currency: plan.currency,
      apiVersion: '2023-08-01'
    });

    let cashfreeResponse: any;
    try {
      // Type assertion needed due to SDK type definitions
      cashfreeResponse = await (cashfree as any).PGCreateOrder("2023-08-01", orderRequest);
    } catch (error: any) {
      console.error('Cashfree API Error:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        statusText: error.response?.statusText,
        headers: error.response?.headers
      });
      
      // Provide more helpful error message
      if (error.response?.status === 401) {
        return res.status(500).json({
          success: false,
          error: 'Cashfree authentication failed. Please check your App ID and Secret Key, and ensure they match the environment (sandbox/production).',
        });
      }
      
      throw error;
    }

    // The response is an AxiosResponse, extract the data
    const responseData = (cashfreeResponse as any).data || cashfreeResponse;

    if (!responseData || !responseData.payment_session_id) {
      console.error('Invalid Cashfree response:', responseData);
      return res.status(500).json({
        success: false,
        error: 'Failed to create payment order - invalid response from Cashfree',
      });
    }

    const { payment_session_id } = responseData;

    // Save order to database
    const order = new Order({
      userId: new mongoose.Types.ObjectId(req.userId),
      planId: new mongoose.Types.ObjectId(planId),
      orderId: orderId,
      paymentSessionId: payment_session_id,
      amount: plan.price,
      currency: plan.currency || 'INR',
      status: OrderStatus.PENDING,
    });

    await order.save();

    res.json({
      success: true,
      data: {
        orderId: orderId,
        paymentSessionId: payment_session_id,
        amount: plan.price,
        currency: plan.currency || 'INR',
      },
    });
  } catch (error: any) {
    console.error('Error creating order:', error);
    res.status(500).json({
      success: false,
      error: error.message || error.toString() || 'Failed to create order',
    });
  }
};

/**
 * Handle Cashfree webhook
 * POST /api/payment/webhook
 */
export const handleWebhook = async (req: Request, res: Response) => {
  try {
    // Cashfree sends webhook with signature for verification
    // For now, we'll process the webhook. In production, verify signature.
    const webhookData = req.body;

    console.log('Received webhook:', JSON.stringify(webhookData, null, 2));

    // Extract order ID from webhook
    const orderId = webhookData.data?.order?.order_id || webhookData.order?.order_id;

    if (!orderId) {
      console.error('No order ID in webhook');
      return res.status(400).json({ error: 'Invalid webhook data' });
    }

    // Find order in database
    const order = await Order.findOne({ orderId });
    if (!order) {
      console.error(`Order not found: ${orderId}`);
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check payment status
    const paymentStatus = webhookData.data?.payment?.payment_status || webhookData.payment?.payment_status;
    const transactionId = webhookData.data?.payment?.cf_payment_id || webhookData.payment?.cf_payment_id;
    const paymentMethod = webhookData.data?.payment?.payment_method || webhookData.payment?.payment_method;
    const paymentAmount = webhookData.data?.payment?.payment_amount || webhookData.payment?.payment_amount;
    const paymentTime = webhookData.data?.payment?.payment_time || webhookData.payment?.payment_time;

    // Update order status and transaction details
    if (paymentStatus === 'SUCCESS' || paymentStatus === 'PAID') {
      order.status = OrderStatus.PAID;
      order.transactionDetails = {
        transactionId: transactionId,
        paymentMethod: paymentMethod as PaymentMethod,
        paymentStatus: paymentStatus,
        amount: paymentAmount ? parseFloat(paymentAmount) : order.amount,
        currency: order.currency,
        paymentTime: paymentTime ? new Date(paymentTime) : new Date(),
      };
      order.cashfreeWebhookData = webhookData;

      await order.save();

      // Update user subscription
      try {
        await subscriptionService.updateSubscriptionPlan(
          order.userId.toString(),
          order.planId.toString()
        );

        console.log(`Subscription updated for user ${order.userId} with plan ${order.planId}`);
      } catch (subscriptionError) {
        console.error('Error updating subscription:', subscriptionError);
        // Log error but don't fail webhook - order is already marked as paid
      }
    } else if (paymentStatus === 'FAILED' || paymentStatus === 'USER_DROPPED') {
      order.status = OrderStatus.FAILED;
      order.transactionDetails = {
        paymentStatus: paymentStatus,
        failureReason: webhookData.data?.payment?.payment_message || webhookData.payment?.payment_message || 'Payment failed',
      };
      order.cashfreeWebhookData = webhookData;
      await order.save();
    }

    // Return success to Cashfree
    res.status(200).json({ message: 'Webhook processed successfully' });
  } catch (error: any) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
};

/**
 * Get order status
 * GET /api/payment/order/:orderId
 */
export const getOrderStatus = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const { orderId } = req.params;

    const order = await Order.findOne({ orderId, userId: req.userId }).populate('planId');

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    res.json({
      success: true,
      data: {
        orderId: order.orderId,
        status: order.status,
        amount: order.amount,
        currency: order.currency,
        transactionDetails: order.transactionDetails,
        plan: order.planId,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      },
    });
  } catch (error: any) {
    console.error('Error fetching order status:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch order status',
    });
  }
};

