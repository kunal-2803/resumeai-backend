import { Router } from 'express';
import { adminLogin, getDashboardStats, getAllUsers, getUserById, updateUserPlan, deleteUser, getAllPlans, createPlan, updatePlan, deletePlan } from '../controllers/adminController';
import { authenticateAdmin } from '../middleware/adminAuth';

const router = Router();

router.post('/login', adminLogin);
router.get('/dashboard/stats', authenticateAdmin, getDashboardStats);
router.get('/users', authenticateAdmin, getAllUsers);
router.get('/users/:id', authenticateAdmin, getUserById);
router.put('/users/:id/plan', authenticateAdmin, updateUserPlan);
router.delete('/users/:id', authenticateAdmin, deleteUser);
router.get('/plans', authenticateAdmin, getAllPlans);
router.post('/plans', authenticateAdmin, createPlan);
router.put('/plans/:id', authenticateAdmin, updatePlan);
router.delete('/plans/:id', authenticateAdmin, deletePlan);

export default router;

