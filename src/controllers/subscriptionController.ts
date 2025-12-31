
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import subscriptionService from '../services/subscriptionService';

/**
 * Get user's current subscription
 */
export const getMySubscription = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const subscription = await subscriptionService.getUserSubscription(req.userId);

    if (!subscription) {
      // Create a default FREE subscription if none exists
      const newSubscription = await subscriptionService.getOrCreateSubscription(req.userId);
      return res.json({
        success: true,
        subscription: {
          id: newSubscription._id.toString(),
          userId: newSubscription.userId.toString(),
          plan: {
            id: (newSubscription.planId as any)._id.toString(),
            name: (newSubscription.planId as any).name,
            type: (newSubscription.planId as any).type,
            price: (newSubscription.planId as any).price,
            currency: (newSubscription.planId as any).currency,
            maxResumes: (newSubscription.planId as any).maxResumes,
            maxATSChecks: (newSubscription.planId as any).maxATSChecks,
            features: (newSubscription.planId as any).features,
          },
          status: newSubscription.status,
          usage: newSubscription.usage,
          left: newSubscription.left,
          startDate: newSubscription.startDate,
          endDate: newSubscription.endDate,
        },
      });
    }

    res.json({
      success: true,
      subscription: {
        id: subscription._id.toString(),
        userId: subscription.userId.toString(),
        plan: {
          id: (subscription.planId as any)._id.toString(),
          name: (subscription.planId as any).name,
          type: (subscription.planId as any).type,
          price: (subscription.planId as any).price,
          currency: (subscription.planId as any).currency,
          maxResumes: (subscription.planId as any).maxResumes,
          maxATSChecks: (subscription.planId as any).maxATSChecks,
          features: (subscription.planId as any).features,
        },
        status: subscription.status,
        usage: subscription.usage,
        left: subscription.left,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
      },
    });
  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch subscription',
    });
  }
};

/**
 * Get all available plans
 */
export const getAllPlans = async (req: AuthRequest, res: Response) => {
  try {
    const plans = await subscriptionService.getAllPlans();

    res.json({
      success: true,
      plans: plans.map((plan) => ({
        id: plan._id.toString(),
        name: plan.name,
        type: plan.type,
        price: plan.price,
        currency: plan.currency,
        maxResumes: plan.maxResumes,
        maxATSChecks: plan.maxATSChecks,
        features: plan.features,
      })),
    });
  } catch (error) {
    console.error('Error fetching plans:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch plans',
    });
  }
};

/**
 * Update user's subscription plan (for future payment integration)
 */
export const updateSubscription = async (req: AuthRequest, res: Response) => {
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

    // For now, just update the subscription without payment
    // In the future, this will integrate with payment gateway
    const subscription = await subscriptionService.updateSubscriptionPlan(req.userId, planId);

    res.json({
      success: true,
      message: 'Subscription updated successfully',
      subscription: {
        id: subscription._id.toString(),
        userId: subscription.userId.toString(),
        plan: {
          id: (subscription.planId as any)._id.toString(),
          name: (subscription.planId as any).name,
          type: (subscription.planId as any).type,
          price: (subscription.planId as any).price,
          currency: (subscription.planId as any).currency,
          maxResumes: (subscription.planId as any).maxResumes,
          maxATSChecks: (subscription.planId as any).maxATSChecks,
          features: (subscription.planId as any).features,
        },
        status: subscription.status,
        usage: subscription.usage,
        left: subscription.left,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
      },
    });
  } catch (error) {
    console.error('Error updating subscription:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update subscription',
    });
  }
};

