import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import subscriptionService from '../services/subscriptionService';

/**
 * Middleware to check if user can create a resume
 */
export const checkResumeLimit = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const check = await subscriptionService.canCreateResume(req.userId);

    if (!check.allowed) {
      return res.status(403).json({
        success: false,
        error: check.message || 'Resume limit reached',
      });
    }

    next();
  } catch (error) {
    console.error('Error checking resume limit:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check subscription limits',
    });
  }
};

/**
 * Middleware to check if user can run an ATS check
 */
export const checkATSLimit = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const check = await subscriptionService.canRunATSCheck(req.userId);

    if (!check.allowed) {
      return res.status(403).json({
        success: false,
        error: check.message || 'ATS check limit reached',
      });
    }

    next();
  } catch (error) {
    console.error('Error checking ATS limit:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check subscription limits',
    });
  }
};

