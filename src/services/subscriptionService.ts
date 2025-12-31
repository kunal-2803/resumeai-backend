import mongoose from 'mongoose';
import Plan, { PlanType, IPlan } from '../models/Plan';
import UserSubscription, { SubscriptionStatus, IUserSubscription } from '../models/UserSubscription';

/**
 * Subscription service to handle subscription logic
 */
class SubscriptionService {
  /**
   * Initialize default plans in the database
   */
  async initializePlans(): Promise<void> {
    const plans = [
      {
        name: 'FREE',
        type: PlanType.FREE,
        price: 0,
        currency: 'INR',
        maxResumes: 1,
        maxATSChecks: 2,
        features: {
          aiRewriteSuggestions: false,
          priorityProcessing: false,
          resumeVersions: false,
        },
      },
      {
        name: 'PRO',
        type: PlanType.PRO,
        price: 199,
        currency: 'INR',
        maxResumes: 5,
        maxATSChecks: 10,
        features: {
          aiRewriteSuggestions: false,
          priorityProcessing: false,
          resumeVersions: false,
        },
      },
      {
        name: 'PREMIUM',
        type: PlanType.PREMIUM,
        price: 800,
        currency: 'INR',
        maxResumes: 20,
        maxATSChecks: 40,
        features: {
          aiRewriteSuggestions: true,
          priorityProcessing: true,
          resumeVersions: true,
        },
      },
    ];

    for (const planData of plans) {
      await Plan.findOneAndUpdate(
        { type: planData.type },
        planData,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
  }

  /**
   * Get or create a subscription for a user (defaults to FREE)
   */
  async getOrCreateSubscription(userId: string): Promise<IUserSubscription> {
    // Find active subscription
    let subscription = await UserSubscription.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      status: SubscriptionStatus.ACTIVE,
    }).populate('planId');

    if (subscription) {
      return subscription;
    }

    // If no active subscription, create a FREE one
    const freePlan = await Plan.findOne({ type: PlanType.FREE });
    if (!freePlan) {
      await this.initializePlans();
      const freePlanAfterInit = await Plan.findOne({ type: PlanType.FREE });
      if (!freePlanAfterInit) {
        throw new Error('Failed to initialize FREE plan');
      }
      return this.createSubscription(userId, freePlanAfterInit._id.toString());
    }

    return this.createSubscription(userId, freePlan._id.toString());
  }

  /**
   * Create a new subscription for a user
   */
  async createSubscription(userId: string, planId: string): Promise<IUserSubscription> {
    const plan = await Plan.findById(planId);
    if (!plan) {
      throw new Error('Plan not found');
    }

    // Deactivate any existing active subscriptions
    await UserSubscription.updateMany(
      {
        userId: new mongoose.Types.ObjectId(userId),
        status: SubscriptionStatus.ACTIVE,
      },
      {
        status: SubscriptionStatus.EXPIRED,
        endDate: new Date(),
      }
    );

    // Create new subscription
    const subscription = new UserSubscription({
      userId: new mongoose.Types.ObjectId(userId),
      planId: new mongoose.Types.ObjectId(planId),
      status: SubscriptionStatus.ACTIVE,
      usage: {
        resumes: 0,
        atsChecks: 0,
      },
      left: {
        resumes: plan.maxResumes,
        atsChecks: plan.maxATSChecks,
      },
      startDate: new Date(),
    });

    await subscription.save();
    return subscription.populate('planId');
  }

  /**
   * Get user's current subscription with plan details
   */
  async getUserSubscription(userId: string): Promise<IUserSubscription | null> {
    const subscription = await UserSubscription.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      status: SubscriptionStatus.ACTIVE,
    }).populate('planId');

    return subscription;
  }

  /**
   * Check if user can create a resume
   */
  async canCreateResume(userId: string): Promise<{ allowed: boolean; message?: string }> {
    const subscription = await this.getOrCreateSubscription(userId);
    const plan = subscription.planId as IPlan;

    if (subscription.left.resumes <= 0) {
      return {
        allowed: false,
        message: `You have reached your resume limit (${plan.maxResumes}). Please upgrade your plan.`,
      };
    }

    return { allowed: true };
  }

  /**
   * Check if user can run an ATS check
   */
  async canRunATSCheck(userId: string): Promise<{ allowed: boolean; message?: string }> {
    const subscription = await this.getOrCreateSubscription(userId);
    const plan = subscription.planId as IPlan;

    if (subscription.left.atsChecks <= 0) {
      return {
        allowed: false,
        message: `You have reached your ATS check limit (${plan.maxATSChecks}). Please upgrade your plan.`,
      };
    }

    return { allowed: true };
  }

  /**
   * Increment resume usage
   */
  async incrementResumeUsage(userId: string): Promise<void> {
    const subscription = await this.getOrCreateSubscription(userId);
    
    if (subscription.left.resumes > 0) {
      subscription.usage.resumes += 1;
      subscription.left.resumes -= 1;
      await subscription.save();
    }
  }

  /**
   * Increment ATS check usage
   */
  async incrementATSUsage(userId: string): Promise<void> {
    const subscription = await this.getOrCreateSubscription(userId);
    
    if (subscription.left.atsChecks > 0) {
      subscription.usage.atsChecks += 1;
      subscription.left.atsChecks -= 1;
      await subscription.save();
    }
  }

  /**
   * Get all available plans
   */
  async getAllPlans(): Promise<IPlan[]> {
    return Plan.find({ isActive: true }).sort({ price: 1 });
  }

  /**
   * Get plan by type
   */
  async getPlanByType(type: PlanType): Promise<IPlan | null> {
    return Plan.findOne({ type, isActive: true });
  }

  /**
   * Update subscription plan (for future payment integration)
   */
  async updateSubscriptionPlan(userId: string, newPlanId: string): Promise<IUserSubscription> {
    return this.createSubscription(userId, newPlanId);
  }
}

export default new SubscriptionService();

