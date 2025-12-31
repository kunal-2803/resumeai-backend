import { Router } from 'express';

const router = Router();

// Example route
router.get('/', (req, res) => {
  res.json({ message: 'API routes' });
});

export default router;
