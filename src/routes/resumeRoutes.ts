import { Router } from 'express';
import {
  uploadResume,
  generateResume,
  improveSection,
  calculateATSScore,
  downloadResume,
  getResumes,
  getResumeById,
  deleteResume,
  upload,
} from '../controllers/resumeController';
import { authenticate } from '../middleware/auth';
import { checkResumeLimit, checkATSLimit } from '../middleware/subscriptionCheck';

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /api/resume - Get all resumes for the authenticated user
router.get('/', getResumes);

// POST /api/resume/upload - Upload resume file or text (checks resume limit)
router.post('/upload', checkResumeLimit, upload.single('file'), uploadResume);

// POST /api/resume/generate - Generate optimized resume (checks resume limit)
router.post('/generate', checkResumeLimit, generateResume);

// POST /api/resume/improve-section - Improve a specific section
router.post('/improve-section', improveSection);

// POST /api/resume/ats-score - Calculate ATS compatibility score (checks ATS limit)
router.post('/ats-score', checkATSLimit, calculateATSScore);

// POST /api/resume/download - Download resume in specified format
router.post('/download', downloadResume);

// GET /api/resume/:id - Get a single resume by ID (must come after specific routes)
router.get('/:id', getResumeById);

// DELETE /api/resume/:id - Delete a resume by ID
router.delete('/:id', deleteResume);

export default router;
