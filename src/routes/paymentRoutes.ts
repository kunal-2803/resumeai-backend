import { Router } from 'express';
import { createOrder, handleWebhook, getOrderStatus } from '../controllers/paymentController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Create payment order (requires authentication)
router.post('/create-order', authenticate, createOrder);

// Webhook endpoint (no authentication - Cashfree will call this)
router.post('/webhook', handleWebhook);

// Get order status (requires authentication)
router.get('/order/:orderId', authenticate, getOrderStatus);

export default router;

