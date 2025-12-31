import { Router } from 'express';
import { extractJobDescription } from '../controllers/jobController';

const router = Router();

// POST /api/job/extract - Extract job description from URL
router.post('/extract', extractJobDescription);

export default router;
