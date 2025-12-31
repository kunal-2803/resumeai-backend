import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Resume } from '../models';
import mongoose from 'mongoose';

/**
 * Get all resumes for the authenticated user
 * Returns list with ATS score, status, and updatedAt
 */
export const getResumes = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const resumes = await Resume.find({
      userId: new mongoose.Types.ObjectId(req.userId),
    })
      .sort({ updatedAt: -1 })
      .select('_id resumeData jobDescription atsScore status createdAt updatedAt')
      .lean();

    const formattedResumes = resumes.map((resume) => ({
      id: resume._id.toString(),
      jobDescription: resume.jobDescription,
      atsScore: resume.atsScore || null,
      status: resume.status,
      createdAt: resume.createdAt,
      updatedAt: resume.updatedAt,
      // Include a preview of resume data (first few fields)
      preview: {
        summary: resume.resumeData?.summary || '',
        skills: resume.resumeData?.skills?.slice(0, 5) || [],
      },
    }));

    res.json({
      success: true,
      resumes: formattedResumes,
      count: formattedResumes.length,
    });
  } catch (error) {
    console.error('Error fetching dashboard resumes:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch resumes',
    });
  }
};

