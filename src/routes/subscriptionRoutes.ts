import express from 'express';
import { authenticate } from '../middleware/auth';
import {
  getMySubscription,
  getAllPlans,
  updateSubscription,
} from '../controllers/subscriptionController';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get current user's subscription
router.get('/me', getMySubscription);

// Get all available plans
router.get('/plans', getAllPlans);

// Update subscription (for future payment integration)
router.put('/update', updateSubscription);

export default router;

