import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import resumeService from '../services/resumeService';
import subscriptionService from '../services/subscriptionService';
import { Resume, ResumeStatus } from '../models';
import multer from 'multer';
import mongoose from 'mongoose';

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF and Word documents are allowed.'));
    }
  },
});

export const uploadResume = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    let parsedData;

    // Check if file was uploaded
    if (req.file) {
      // Pass buffer and filename to service
      parsedData = await resumeService.parseResume(req.file.buffer, req.file.originalname, undefined, req.userId);
    } else if (req.body.text) {
      // Pass plain text to service
      parsedData = await resumeService.parseResume(undefined, undefined, req.body.text, req.userId);
    } else {
      return res.status(400).json({
        success: false,
        error: 'Either a file or text must be provided',
      });
    }

    // Save to database
    const resume = new Resume({
      userId: new mongoose.Types.ObjectId(req.userId),
      resumeData: parsedData,
      status: ResumeStatus.PARSED,
    });

    await resume.save();

    // Track resume usage
    await subscriptionService.incrementResumeUsage(req.userId);

    res.json({
      success: true,
      resumeId: resume._id.toString(),
      parsedData,
    });
  } catch (error) {
    console.error('Error uploading resume:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload resume',
    });
  }
};

export const generateResume = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const { resumeData, jobDescription, outputType, resumeId } = req.body;

    if (!jobDescription || !outputType) {
      return res.status(400).json({
        success: false,
        error: 'jobDescription and outputType are required',
      });
    }

    const result = await resumeService.generateResume(resumeData || {}, jobDescription, outputType, req.userId);

    // Save or update in database
    let isNewResume = false;
    if (resumeId) {
      // Update existing resume
      const resume = await Resume.findOne({
        _id: resumeId,
        userId: new mongoose.Types.ObjectId(req.userId),
      });

      if (resume) {
        resume.resumeData = resumeData || resume.resumeData;
        resume.jobDescription = jobDescription;
        resume.status = ResumeStatus.GENERATED;
        await resume.save();
      }
    } else {
      // Create new resume
      isNewResume = true;
      const resume = new Resume({
        userId: new mongoose.Types.ObjectId(req.userId),
        resumeData: resumeData || {},
        jobDescription,
        status: ResumeStatus.GENERATED,
      });
      await resume.save();
    }

    // Track resume usage only for new resumes
    if (isNewResume) {
      await subscriptionService.incrementResumeUsage(req.userId);
    }

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Error generating resume:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate resume',
    });
  }
};

export const improveSection = async (req: AuthRequest, res: Response) => {
  try {
    const { sectionType, sectionContent, jobDescription } = req.body;

    if (!sectionType || !sectionContent || !jobDescription) {
      return res.status(400).json({
        success: false,
        error: 'sectionType, sectionContent, and jobDescription are required',
      });
    }

    const result = await resumeService.improveSection(sectionType, sectionContent, jobDescription, req.userId);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Error improving section:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to improve section',
    });
  }
};

export const calculateATSScore = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const { resumeData, jobDescription, resumeId } = req.body;

    if (!jobDescription) {
      return res.status(400).json({
        success: false,
        error: 'jobDescription is required',
      });
    }

    const result = await resumeService.calculateATSScore(resumeData || {}, jobDescription, req.userId);

    // Track ATS check usage
    await subscriptionService.incrementATSUsage(req.userId);

    // Store jobDescription and ATS score in database
    let resume;
    if (resumeId) {
      // Update existing resume if resumeId is provided
      resume = await Resume.findOne({
        _id: resumeId,
        userId: new mongoose.Types.ObjectId(req.userId),
      });
    } else {
      // If resumeId is not provided, find the most recent resume for the user
      resume = await Resume.findOne({
        userId: new mongoose.Types.ObjectId(req.userId),
      })
        .sort({ createdAt: -1 })
        .exec();
    }

    if (resume) {
      // Update existing resume
      resume.atsScore = result.score;
      resume.jobDescription = jobDescription;
      if (resumeData) {
        resume.resumeData = resumeData;
      }
      await resume.save();
    } else if (resumeData && Object.keys(resumeData).length > 0) {
      // Create new resume if none exists and we have resumeData
      resume = new Resume({
        userId: new mongoose.Types.ObjectId(req.userId),
        resumeData: resumeData,
        jobDescription: jobDescription,
        atsScore: result.score,
        status: ResumeStatus.PARSED,
      });
      await resume.save();
    }

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Error calculating ATS score:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to calculate ATS score',
    });
  }
};

export const downloadResume = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const { resumeData, resumeId } = req.body;
    const format = (req.query.format as 'pdf' | 'latex') || 'pdf';

    let dataToDownload = resumeData;

    // If resumeId is provided, fetch from database
    if (resumeId && !resumeData) {
      const resume = await Resume.findOne({
        _id: resumeId,
        userId: new mongoose.Types.ObjectId(req.userId),
      });

      if (!resume) {
        return res.status(404).json({
          success: false,
          error: 'Resume not found',
        });
      }

      dataToDownload = resume.resumeData;
    }

    if (!dataToDownload) {
      return res.status(400).json({
        success: false,
        error: 'resumeData is required',
      });
    }

    if (format !== 'pdf' && format !== 'latex') {
      return res.status(400).json({
        success: false,
        error: 'format must be either pdf or latex',
      });
    }

    const result = await resumeService.generateResumeFile(dataToDownload, format);

    // Set headers for file download
    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Content-Length', result.buffer.length);

    // Send the file buffer
    res.send(result.buffer);
  } catch (error) {
    console.error('Error downloading resume:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to download resume',
    });
  }
};

/**
 * Get all resumes for the authenticated user
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
      .sort({ createdAt: -1 })
      .select('-__v')
      .lean();

    res.json({
      success: true,
      resumes: resumes.map((resume) => ({
        id: resume._id.toString(),
        resumeData: resume.resumeData,
        jobDescription: resume.jobDescription,
        atsScore: resume.atsScore,
        status: resume.status,
        createdAt: resume.createdAt,
        updatedAt: resume.updatedAt,
      })),
    });
  } catch (error) {
    console.error('Error fetching resumes:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch resumes',
    });
  }
};

/**
 * Get a single resume by ID
 */
export const getResumeById = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Resume ID is required',
      });
    }

    const resume = await Resume.findOne({
      _id: id,
      userId: new mongoose.Types.ObjectId(req.userId),
    }).lean();

    if (!resume) {
      return res.status(404).json({
        success: false,
        error: 'Resume not found',
      });
    }

    res.json({
      success: true,
      resume: {
        id: resume._id.toString(),
        resumeData: resume.resumeData,
        jobDescription: resume.jobDescription,
        atsScore: resume.atsScore,
        status: resume.status,
        createdAt: resume.createdAt,
        updatedAt: resume.updatedAt,
      },
    });
  } catch (error) {
    console.error('Error fetching resume:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch resume',
    });
  }
};

/**
 * Delete a resume by ID
 */
export const deleteResume = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Resume ID is required',
      });
    }

    const resume = await Resume.findOneAndDelete({
      _id: id,
      userId: new mongoose.Types.ObjectId(req.userId),
    });

    if (!resume) {
      return res.status(404).json({
        success: false,
        error: 'Resume not found',
      });
    }

    res.json({
      success: true,
      message: 'Resume deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting resume:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete resume',
    });
  }
};

// Export multer upload middleware
export { upload };
