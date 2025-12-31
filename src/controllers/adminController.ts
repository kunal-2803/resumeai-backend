import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt, { SignOptions } from 'jsonwebtoken';
import mongoose from 'mongoose';
import { Admin, User, UserSubscription, Plan, PlanType, OpenAIUsage, Resume } from '../models';
import { AdminAuthRequest } from '../middleware/adminAuth';
import subscriptionService from '../services/subscriptionService';

const JWT_SECRET: string = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Admin login
 */
export const adminLogin = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required',
      });
    }

    // Find admin and include passwordHash
    const admin = await Admin.findOne({ email }).select('+passwordHash');
    if (!admin) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, admin.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
      });
    }

    // Generate JWT
    const token = jwt.sign(
      { adminId: admin._id.toString(), role: 'admin' },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN } as SignOptions
    );

    res.json({
      success: true,
      token,
      admin: {
        id: admin._id,
        email: admin.email,
        createdAt: admin.createdAt,
      },
    });
  } catch (error) {
    console.error('Error logging in admin:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to login',
    });
  }
};

/**
 * Get dashboard statistics
 */
export const getDashboardStats = async (_req: AdminAuthRequest, res: Response) => {
  try {
    // Get total users count
    const totalUsers = await User.countDocuments();

    // Get paid plans (PRO and PREMIUM)
    const paidPlans = await Plan.find({
      type: { $in: [PlanType.PRO, PlanType.PREMIUM] },
      isActive: true,
    });

    // Get all active subscriptions with paid plans
    const paidSubscriptions = await UserSubscription.find({
      planId: { $in: paidPlans.map((plan) => plan._id) },
      status: 'active',
    }).populate('planId');

    // Count unique paid users
    const paidUserIds = new Set(paidSubscriptions.map((sub) => sub.userId.toString()));
    const totalPaidUsers = paidUserIds.size;

    // Calculate total revenue (sum of all paid plan prices)
    // Note: This assumes each active subscription represents revenue
    // You might want to track actual payments separately for more accurate revenue
    const totalRevenue = paidSubscriptions.reduce((sum, subscription) => {
      const plan = subscription.planId as any;
      if (plan && plan.price) {
        return sum + plan.price;
      }
      return sum;
    }, 0);

    // Calculate monthly OpenAI usage (current month)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const monthlyOpenAIUsage = await OpenAIUsage.aggregate([
      {
        $match: {
          createdAt: {
            $gte: startOfMonth,
            $lte: endOfMonth,
          },
        },
      },
      {
        $group: {
          _id: null,
          totalTokens: { $sum: '$totalTokens' },
          totalCost: { $sum: '$cost' },
        },
      },
    ]);

    const openAIStats = monthlyOpenAIUsage.length > 0
      ? {
          totalTokens: monthlyOpenAIUsage[0].totalTokens,
          totalCost: monthlyOpenAIUsage[0].totalCost,
        }
      : {
          totalTokens: 0,
          totalCost: 0,
        };

    res.json({
      success: true,
      data: {
        totalUsers,
        totalPaidUsers,
        totalRevenue,
        monthlyOpenAIUsage: openAIStats,
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch dashboard statistics',
    });
  }
};

/**
 * Get all users with their statistics
 */
export const getAllUsers = async (_req: AdminAuthRequest, res: Response) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });

    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        // Get user's active subscription
        const subscription = await UserSubscription.findOne({
          userId: user._id,
          status: 'active',
        }).populate('planId');

        // Get plan status
        let planStatus = 'Free';
        if (subscription && subscription.planId) {
          const plan = subscription.planId as any;
          planStatus = plan.type || 'Free';
        }

        // Count total resumes
        const totalResumes = await Resume.countDocuments({ userId: user._id });

        // Get total OpenAI usage
        const openAIUsage = await OpenAIUsage.aggregate([
          {
            $match: {
              userId: user._id,
            },
          },
          {
            $group: {
              _id: null,
              totalTokens: { $sum: '$totalTokens' },
              totalCost: { $sum: '$cost' },
            },
          },
        ]);

        const usage = openAIUsage.length > 0
          ? {
              totalTokens: openAIUsage[0].totalTokens,
              totalCost: openAIUsage[0].totalCost,
            }
          : {
              totalTokens: 0,
              totalCost: 0,
            };

        return {
          id: user._id.toString(),
          email: user.email,
          createdAt: user.createdAt,
          planStatus,
          totalResumes,
          totalOpenAIUsage: usage.totalTokens,
          totalOpenAICost: usage.totalCost,
        };
      })
    );

    res.json({
      success: true,
      data: usersWithStats,
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch users',
    });
  }
};

/**
 * Get user by ID with detailed information
 */
export const getUserById = async (req: AdminAuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID',
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Get user's active subscription
    const subscription = await UserSubscription.findOne({
      userId: user._id,
      status: 'active',
    }).populate('planId');

    // Get plan status
    let planStatus = 'Free';
    let currentPlanId = null;
    if (subscription && subscription.planId) {
      const plan = subscription.planId as any;
      planStatus = plan.type || 'Free';
      currentPlanId = plan._id.toString();
    }

    // Get all available plans
    const allPlans = await Plan.find({ isActive: true }).sort({ price: 1 });

    res.json({
      success: true,
      data: {
        id: user._id.toString(),
        email: user.email,
        createdAt: user.createdAt,
        planStatus,
        currentPlanId,
        availablePlans: allPlans.map((plan) => ({
          id: plan._id.toString(),
          name: plan.name,
          type: plan.type,
          price: plan.price,
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch user',
    });
  }
};

/**
 * Update user's plan
 */
export const updateUserPlan = async (req: AdminAuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { planId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID',
      });
    }

    if (!planId) {
      return res.status(400).json({
        success: false,
        error: 'Plan ID is required',
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Update subscription plan
    const updatedSubscription = await subscriptionService.updateSubscriptionPlan(id, planId);

    res.json({
      success: true,
      message: 'User plan updated successfully',
      data: {
        subscriptionId: updatedSubscription._id.toString(),
        planId: updatedSubscription.planId.toString(),
      },
    });
  } catch (error) {
    console.error('Error updating user plan:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update user plan',
    });
  }
};

/**
 * Delete user
 */
export const deleteUser = async (req: AdminAuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID',
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Delete user and related data
    await UserSubscription.deleteMany({ userId: user._id });
    await Resume.deleteMany({ userId: user._id });
    await OpenAIUsage.deleteMany({ userId: user._id });
    await User.deleteOne({ _id: user._id });

    res.json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete user',
    });
  }
};

/**
 * Get all plans
 */
export const getAllPlans = async (_req: AdminAuthRequest, res: Response) => {
  try {
    const plans = await Plan.find().sort({ price: 1 });

    res.json({
      success: true,
      data: plans.map((plan) => ({
        id: plan._id.toString(),
        name: plan.name,
        type: plan.type,
        price: plan.price,
        currency: plan.currency,
        maxResumes: plan.maxResumes,
        maxATSChecks: plan.maxATSChecks,
        features: plan.features,
        isActive: plan.isActive,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
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
 * Create a new plan
 */
export const createPlan = async (req: AdminAuthRequest, res: Response) => {
  try {
    const {
      name,
      type,
      price,
      currency = 'INR',
      maxResumes,
      maxATSChecks,
      features = {
        aiRewriteSuggestions: false,
        priorityProcessing: false,
        resumeVersions: false,
      },
      isActive = true,
    } = req.body;

    // Validate required fields
    if (!name || !type || price === undefined || !maxResumes || !maxATSChecks) {
      return res.status(400).json({
        success: false,
        error: 'Name, type, price, maxResumes, and maxATSChecks are required',
      });
    }

    // Validate plan type
    if (!Object.values(PlanType).includes(type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid plan type. Must be one of: ${Object.values(PlanType).join(', ')}`,
      });
    }

    // Check if plan type already exists
    const existingPlan = await Plan.findOne({ type });
    if (existingPlan) {
      return res.status(400).json({
        success: false,
        error: 'Plan with this type already exists',
      });
    }

    // Create new plan
    const plan = new Plan({
      name,
      type,
      price,
      currency,
      maxResumes,
      maxATSChecks,
      features,
      isActive,
    });

    await plan.save();

    res.status(201).json({
      success: true,
      message: 'Plan created successfully',
      data: {
        id: plan._id.toString(),
        name: plan.name,
        type: plan.type,
        price: plan.price,
        currency: plan.currency,
        maxResumes: plan.maxResumes,
        maxATSChecks: plan.maxATSChecks,
        features: plan.features,
        isActive: plan.isActive,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
      },
    });
  } catch (error) {
    console.error('Error creating plan:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create plan',
    });
  }
};

/**
 * Update a plan
 */
export const updatePlan = async (req: AdminAuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const {
      name,
      price,
      currency,
      maxResumes,
      maxATSChecks,
      features,
      isActive,
    } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid plan ID',
      });
    }

    const plan = await Plan.findById(id);
    if (!plan) {
      return res.status(404).json({
        success: false,
        error: 'Plan not found',
      });
    }

    // Update fields
    if (name !== undefined) plan.name = name;
    if (price !== undefined) plan.price = price;
    if (currency !== undefined) plan.currency = currency;
    if (maxResumes !== undefined) plan.maxResumes = maxResumes;
    if (maxATSChecks !== undefined) plan.maxATSChecks = maxATSChecks;
    if (features !== undefined) plan.features = { ...plan.features, ...features };
    if (isActive !== undefined) plan.isActive = isActive;

    await plan.save();

    res.json({
      success: true,
      message: 'Plan updated successfully',
      data: {
        id: plan._id.toString(),
        name: plan.name,
        type: plan.type,
        price: plan.price,
        currency: plan.currency,
        maxResumes: plan.maxResumes,
        maxATSChecks: plan.maxATSChecks,
        features: plan.features,
        isActive: plan.isActive,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
      },
    });
  } catch (error) {
    console.error('Error updating plan:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update plan',
    });
  }
};

/**
 * Delete a plan
 */
export const deletePlan = async (req: AdminAuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid plan ID',
      });
    }

    const plan = await Plan.findById(id);
    if (!plan) {
      return res.status(404).json({
        success: false,
        error: 'Plan not found',
      });
    }

    // Check if plan is being used by any active subscriptions
    const activeSubscriptions = await UserSubscription.countDocuments({
      planId: plan._id,
      status: 'active',
    });

    if (activeSubscriptions > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete plan. It is currently used by ${activeSubscriptions} active subscription(s).`,
      });
    }

    await Plan.deleteOne({ _id: plan._id });

    res.json({
      success: true,
      message: 'Plan deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting plan:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete plan',
    });
  }
};
