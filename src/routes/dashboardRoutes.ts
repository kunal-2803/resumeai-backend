import { Router } from 'express';
import { getResumes } from '../controllers/dashboardController';
import { authenticate } from '../middleware/auth';

const router = Router();

// All dashboard routes require authentication
router.use(authenticate);

// GET /api/dashboard/resumes - Get all resumes for the authenticated user
router.get('/resumes', getResumes);

export default router;

