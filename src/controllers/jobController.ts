import { Request, Response } from 'express';
import jobService from '../services/jobService';

export const extractJobDescription = async (req: Request, res: Response) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'url is required',
      });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return res.status(400).json({
        success: false,
        error: 'Invalid URL format',
      });
    }

    const result = await jobService.extractJobDescription(url);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Error extracting job description:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to extract job description',
    });
  }
};
