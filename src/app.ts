import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './utils/db';

// Load environment variables
dotenv.config();

//add a test commet

const app: Application = express();

// Connect to MongoDB
connectDB()
  .then(async () => {
    // Initialize plans after DB connection
    const subscriptionService = (await import('./services/subscriptionService')).default;
    subscriptionService.initializePlans().catch((error) => {
      console.error('Failed to initialize plans:', error);
    });
  })
  .catch((error) => {
    console.error('Failed to connect to MongoDB:', error);
    process.exit(1);
  });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check route
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', message: 'Server is running' });
});

// API routes
import resumeRoutes from './routes/resumeRoutes';
import jobRoutes from './routes/jobRoutes';
import authRoutes from './routes/authRoutes';
import adminRoutes from './routes/adminRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import subscriptionRoutes from './routes/subscriptionRoutes';
import paymentRoutes from './routes/paymentRoutes';

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/resume', resumeRoutes);
app.use('/api/job', jobRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/payment', paymentRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

export default app;
