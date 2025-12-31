import { ResumeData, ResumeSectionType, ExperienceItem, ProjectItem, EducationItem, ContactInfo } from '../models/types';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import OpenAI from 'openai';
import { buildResumeGenerationMessages, buildSectionImprovementMessages } from '../utils/promptBuilder';
import openaiUsageService from './openaiUsageService';

interface ParseResumeResult {
  rawText: string;
  skills: string[];
  experience: string[];
  structuredData?: ResumeData; // AI-parsed structured data
}

class ResumeService {
  /**
   * Parse resume from file buffer or text
   * @param buffer - File buffer (for PDF/DOCX) or undefined for plain text
   * @param filename - Original filename (optional, used to determine file type)
   * @param plainText - Plain text content (if no file provided)
   * @param userId - User ID for usage tracking (optional)
   */
  async parseResume(
    buffer?: Buffer,
    filename?: string,
    plainText?: string,
    userId?: string
  ): Promise<ParseResumeResult> {
    let rawText: string;

    // Handle plain text input
    if (plainText) {
      rawText = plainText.trim();
    } else if (!buffer) {
      throw new Error('Either buffer or plainText must be provided');
    } else {
      // Determine file type from filename or buffer
      const fileType = this.getFileType(filename, buffer);

      try {
        switch (fileType) {
          case 'pdf':
            rawText = await this.extractTextFromPDF(buffer);
            break;

          case 'docx':
            rawText = await this.extractTextFromDOCX(buffer);
            break;

          default:
            throw new Error(`Unsupported file type: ${fileType}. Only PDF and DOCX files are supported.`);
        }
      } catch (error) {
        throw new Error(`Failed to extract text from file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Use AI to parse resume into structured data
    let structuredData: ResumeData | undefined;
    try {
      structuredData = await this.parseResumeWithAI(rawText, userId);
    } catch (error) {
      console.error('AI parsing failed, falling back to simple extraction:', error);
      // Fallback to simple extraction if AI parsing fails
    }

    // Extract skills and experience (fallback or for backward compatibility)
    const skills = structuredData?.skills || this.extractSkills(rawText);
    const experience = structuredData?.experience 
      ? structuredData.experience.map(exp => `${exp.title} at ${exp.company}`)
      : this.extractExperience(rawText);

    return {
      rawText,
      skills,
      experience,
      structuredData,
    };
  }

  /**
   * Extract text from PDF buffer
   */
  private async extractTextFromPDF(buffer: Buffer): Promise<string> {
    try {
      const data = await pdfParse(buffer);
      return data.text.trim();
    } catch (error) {
      throw new Error(`PDF parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract text from DOCX buffer
   */
  private async extractTextFromDOCX(buffer: Buffer): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value.trim();
    } catch (error) {
      throw new Error(`DOCX parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Determine file type from filename or buffer
   */
  private getFileType(filename?: string, buffer?: Buffer): 'pdf' | 'docx' | 'unknown' {
    if (filename) {
      const ext = filename.toLowerCase().split('.').pop();
      if (ext === 'pdf') return 'pdf';
      if (ext === 'docx' || ext === 'doc') return 'docx';
    }

    // Try to detect from buffer (check file signature/magic bytes)
    if (buffer && buffer.length >= 4) {
      // PDF signature: %PDF (first 4 bytes)
      const pdfSignature = buffer.subarray(0, 4).toString('ascii');
      if (pdfSignature === '%PDF') {
        return 'pdf';
      }

      // DOCX signature: PK (ZIP format - first 2 bytes are 0x50 0x4B = "PK")
      if (buffer[0] === 0x50 && buffer[1] === 0x4B) {
        // Check if it's a DOCX by looking for word/ directory in ZIP
        const bufferStr = buffer.toString('binary');
        if (bufferStr.includes('word/')) {
          return 'docx';
        }
      }
    }

    return 'unknown';
  }

  /**
   * Parse resume text into structured ResumeData using AI
   * @param rawText - Raw resume text
   * @param userId - User ID for usage tracking (optional)
   */
  private async parseResumeWithAI(rawText: string, userId?: string): Promise<ResumeData> {
    // Validate OpenAI API key
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }

    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: apiKey,
    });

    const systemPrompt = `You are an expert resume parser. Your task is to extract structured information from resume text and return it as JSON.

CRITICAL RULES:
1. Extract ALL information accurately from the resume text
2. Do NOT add, invent, or fabricate any information
3. If a section is missing, use empty arrays or empty strings
4. Parse dates in formats like "Jan 2020 - Dec 2022", "2020-2022", "Present", "Current"
5. Extract contact information if available (name, email, phone, LinkedIn, GitHub, portfolio, location)
6. For experience items, extract: title, company, location (if available), startDate, endDate, current (boolean), and bullets
7. For projects, extract: name, description, technologies (array), link (if available), and bullets
8. For education, extract: degree, institution, location (if available), graduationDate, gpa (if available), and highlights (if available)
9. Generate unique IDs for each item using UUID format (you can use simple incremental IDs like "exp-1", "proj-1", "edu-1")
10. Extract skills as an array of strings
11. Extract summary/professional summary/objective as a single string

Return ONLY valid JSON in this exact format:
{
  "summary": "professional summary text or empty string",
  "skills": ["skill1", "skill2", ...],
  "experience": [
    {
      "id": "exp-1",
      "title": "Job Title",
      "company": "Company Name",
      "location": "City, State (optional)",
      "startDate": "Month YYYY or YYYY",
      "endDate": "Month YYYY, YYYY, or empty string if current",
      "current": true/false,
      "bullets": ["bullet point 1", "bullet point 2", ...]
    }
  ],
  "projects": [
    {
      "id": "proj-1",
      "name": "Project Name",
      "description": "Brief description",
      "technologies": ["tech1", "tech2", ...],
      "link": "URL or empty string",
      "bullets": ["bullet point 1", ...]
    }
  ],
  "education": [
    {
      "id": "edu-1",
      "degree": "Degree Name",
      "institution": "Institution Name",
      "location": "City, State (optional)",
      "graduationDate": "Month YYYY or YYYY",
      "gpa": "GPA or empty string",
      "highlights": ["highlight 1", ...]
    }
  ],
  "contact": {
    "name": "Full Name or empty string",
    "email": "email@example.com or empty string",
    "phone": "phone number or empty string",
    "linkedin": "LinkedIn URL or empty string",
    "github": "GitHub URL or empty string",
    "portfolio": "Portfolio URL or empty string",
    "location": "City, State or empty string"
  }
}`;

    const userPrompt = `Parse the following resume text and extract all information into the structured JSON format:

${rawText}

Return ONLY the JSON object, no additional text or explanations.`;

    try {
      const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      const response = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1, // Low temperature for accurate extraction
        max_tokens: 4000,
        response_format: { type: 'json_object' },
      });

      // Track usage if userId is provided
      if (userId && response.usage) {
        try {
          await openaiUsageService.trackUsageFromResponse(
            userId,
            'parseResume',
            model,
            response,
            {}
          );
        } catch (usageError) {
          console.error('Failed to track OpenAI usage:', usageError);
          // Don't fail the request if usage tracking fails
        }
      }

      const responseContent = response.choices[0]?.message?.content?.trim() || '';
      if (!responseContent) {
        throw new Error('Empty response from OpenAI');
      }

      // Parse JSON response
      let parsedData: any;
      try {
        parsedData = JSON.parse(responseContent);
      } catch (parseError) {
        // Fallback: try to extract JSON from markdown code blocks
        const jsonMatch = responseContent.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
        if (jsonMatch) {
          parsedData = JSON.parse(jsonMatch[1]);
        } else {
          throw new Error('Failed to parse OpenAI response as JSON');
        }
      }

      // Validate and normalize the parsed data
      const structuredData: ResumeData = {
        summary: parsedData.summary || '',
        skills: Array.isArray(parsedData.skills) ? parsedData.skills : [],
        experience: this.normalizeExperienceItems(parsedData.experience || []),
        projects: this.normalizeProjectItems(parsedData.projects || []),
        education: this.normalizeEducationItems(parsedData.education || []),
        contact: this.normalizeContactInfo(parsedData.contact || {}),
      };

      return structuredData;
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        throw new Error(`OpenAI API error: ${error.message}`);
      }
      throw error instanceof Error ? error : new Error('Failed to parse resume with AI');
    }
  }

  /**
   * Normalize experience items to ensure proper structure
   */
  private normalizeExperienceItems(items: any[]): ExperienceItem[] {
    return items.map((item, index) => ({
      id: item.id || `exp-${index + 1}`,
      title: item.title || '',
      company: item.company || '',
      location: item.location || undefined,
      startDate: item.startDate || '',
      endDate: item.endDate || undefined,
      current: item.current || false,
      bullets: Array.isArray(item.bullets) ? item.bullets : [],
    }));
  }

  /**
   * Normalize project items to ensure proper structure
   */
  private normalizeProjectItems(items: any[]): ProjectItem[] {
    return items.map((item, index) => ({
      id: item.id || `proj-${index + 1}`,
      name: item.name || '',
      description: item.description || '',
      technologies: Array.isArray(item.technologies) ? item.technologies : [],
      link: item.link || undefined,
      bullets: Array.isArray(item.bullets) ? item.bullets : [],
    }));
  }

  /**
   * Normalize education items to ensure proper structure
   */
  private normalizeEducationItems(items: any[]): EducationItem[] {
    return items.map((item, index) => ({
      id: item.id || `edu-${index + 1}`,
      degree: item.degree || '',
      institution: item.institution || '',
      location: item.location || undefined,
      graduationDate: item.graduationDate || '',
      gpa: item.gpa || undefined,
      highlights: Array.isArray(item.highlights) ? item.highlights : undefined,
    }));
  }

  /**
   * Normalize contact info to ensure proper structure
   */
  private normalizeContactInfo(contact: any): ContactInfo {
    return {
      name: contact.name || '',
      email: contact.email || '',
      phone: contact.phone || undefined,
      linkedin: contact.linkedin || undefined,
      github: contact.github || undefined,
      portfolio: contact.portfolio || undefined,
      location: contact.location || undefined,
    };
  }

  /**
   * Extract skills from resume text (simple keyword-based approach - fallback)
   */
  private extractSkills(text: string): string[] {
    const skills: string[] = [];

    // Common section headers for skills
    const skillPatterns = [
      /skills?[:\s\n]+(.*?)(?=\n\n|\n[A-Z][a-z]+:|$)/is,
      /technical\s+skills?[:\s\n]+(.*?)(?=\n\n|\n[A-Z][a-z]+:|$)/is,
      /core\s+competencies?[:\s\n]+(.*?)(?=\n\n|\n[A-Z][a-z]+:|$)/is,
    ];

    for (const pattern of skillPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        // Split by common delimiters
        const extracted = match[1]
          .split(/[,\n•\-\*\|]/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0 && s.length < 50); // Filter out very long strings
        skills.push(...extracted);
        break; // Use first match found
      }
    }

    return [...new Set(skills)]; // Remove duplicates
  }

  /**
   * Extract experience entries from resume text
   */
  private extractExperience(text: string): string[] {
    const experience: string[] = [];
    
    // Common section headers for experience
    const experiencePatterns = [
      /(?:work\s+)?experience[:\s\n]+(.*?)(?=\n\n(?:education|projects|skills|$))/is,
      /employment\s+history[:\s\n]+(.*?)(?=\n\n(?:education|projects|skills|$))/is,
      /professional\s+experience[:\s\n]+(.*?)(?=\n\n(?:education|projects|skills|$))/is,
    ];

    for (const pattern of experiencePatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        // Split by common job entry patterns (lines with dates, company names, etc.)
        const entries = match[1]
          .split(/\n(?=\w+\s+\d{4}|\w+\s+\d{2}\/\d{4}|[A-Z][a-z]+\s+at\s+[A-Z])/i)
          .map((s) => s.trim())
          .filter((s) => s.length > 10); // Filter out very short entries
        experience.push(...entries);
        break; // Use first match found
      }
    }

    return experience;
  }

  /**
   * Generate optimized resume using AI
   * @param resumeData - Structured resume data or empty object
   * @param jobDescription - Target job description
   * @param outputType - 'latex' for LaTeX format, 'direct' for plain text/HTML
   * @returns Generated resume content in the specified format
   */
  async generateResume(
    resumeData: ResumeData | Record<string, never>,
    jobDescription: string,
    outputType: 'latex' | 'direct',
    userId?: string
  ): Promise<{ generatedResume: string; format: 'latex' | 'html' }> {
    // Validate OpenAI API key
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }

    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: apiKey,
    });

    // Convert resume data to text format
    // If resumeData is empty or has no meaningful content, use empty string
    const resumeText = this.convertResumeDataToText(resumeData);
    
    if (!resumeText.trim()) {
      throw new Error('Resume data is empty. Please provide resume content to generate an optimized version.');
    }

    if (!jobDescription.trim()) {
      throw new Error('Job description is required for resume optimization.');
    }

    try {
      // Build prompts using modular prompt builder
      const messages = buildResumeGenerationMessages({
        resumeText,
        jobDescription,
        outputType,
      });

      // Call OpenAI API
      const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      const response = await openai.chat.completions.create({
        model,
        messages: messages,
        temperature: 0.7, // Balanced creativity and consistency
        max_tokens: 4000, // Sufficient for a full resume
      });

      // Track usage if userId is provided
      if (userId && response.usage) {
        try {
          await openaiUsageService.trackUsageFromResponse(
            userId,
            'generateResume',
            model,
            response,
            { outputType }
          );
        } catch (usageError) {
          console.error('Failed to track OpenAI usage:', usageError);
          // Don't fail the request if usage tracking fails
        }
      }

      // Extract generated resume content
      const generatedResume = response.choices[0]?.message?.content?.trim() || '';

      if (!generatedResume) {
        throw new Error('Failed to generate resume content from OpenAI');
      }

      return {
        generatedResume,
        format: outputType === 'latex' ? 'latex' : 'html',
      };
    } catch (error) {
      // Handle OpenAI API errors
      if (error instanceof OpenAI.APIError) {
        throw new Error(`OpenAI API error: ${error.message}`);
      }
      
      // Re-throw other errors
      throw error instanceof Error 
        ? error 
        : new Error('An unexpected error occurred during resume generation');
    }
  }

  /**
   * Improve a specific section of the resume using AI
   * @param sectionType - Type of resume section to improve
   * @param sectionContent - Current content of the section
   * @param jobDescription - Target job description for alignment
   * @param userId - User ID for usage tracking (optional)
   * @returns Improved section content and list of changes made
   */
  async improveSection(
    sectionType: ResumeSectionType,
    sectionContent: string,
    jobDescription: string,
    userId?: string
  ): Promise<{ improvedContent: string; changes: string[] }> {
    // Validate OpenAI API key
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }

    // Validate inputs
    if (!sectionContent.trim()) {
      throw new Error('Section content is required for improvement');
    }

    if (!jobDescription.trim()) {
      throw new Error('Job description is required for section improvement');
    }

    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: apiKey,
    });

    try {
      // Build prompts using modular prompt builder
      const messages = buildSectionImprovementMessages({
        sectionType,
        sectionContent,
        jobDescription,
      });

      // Call OpenAI API
      // Request JSON response format (supported by gpt-4o-mini and most modern models)
      // Fallback parsing handles cases where JSON mode isn't perfectly formatted
      const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      const response = await openai.chat.completions.create({
        model,
        messages: messages,
        temperature: 0.7, // Balanced creativity and consistency
        max_tokens: 2000, // Sufficient for a section improvement
        response_format: { type: 'json_object' }, // Request JSON response
      });

      // Track usage if userId is provided
      if (userId && response.usage) {
        try {
          await openaiUsageService.trackUsageFromResponse(
            userId,
            'improveSection',
            model,
            response,
            { sectionType }
          );
        } catch (usageError) {
          console.error('Failed to track OpenAI usage:', usageError);
          // Don't fail the request if usage tracking fails
        }
      }

      // Extract and parse JSON response
      const responseContent = response.choices[0]?.message?.content?.trim() || '';

      if (!responseContent) {
        throw new Error('Failed to get response from OpenAI');
      }

      let parsedResponse: { improvedContent: string; changes: string[] };
      
      try {
        parsedResponse = JSON.parse(responseContent);
      } catch (parseError) {
        // Fallback: try to extract JSON from markdown code blocks
        const jsonMatch = responseContent.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
        if (jsonMatch) {
          parsedResponse = JSON.parse(jsonMatch[1]);
        } else {
          throw new Error('Failed to parse OpenAI response as JSON');
        }
      }

      // Validate response structure
      if (!parsedResponse || typeof parsedResponse !== 'object') {
        throw new Error('Invalid response format from OpenAI: response is not an object');
      }

      // Validate and normalize improvedContent
      let improvedContent: string;
      if (typeof parsedResponse.improvedContent === 'string') {
        improvedContent = parsedResponse.improvedContent.trim();
      } else if (parsedResponse.improvedContent != null) {
        // Try to convert to string if it's not null/undefined
        improvedContent = String(parsedResponse.improvedContent).trim();
      } else {
        throw new Error('Invalid response format from OpenAI: improvedContent is missing or invalid');
      }

      // Validate changes array
      if (!Array.isArray(parsedResponse.changes)) {
        throw new Error('Invalid response format from OpenAI: changes is not an array');
      }

      // Ensure changes array is concise (max 7 items as per prompt)
      const changes = parsedResponse.changes
        .slice(0, 7)
        .filter((change: any) => typeof change === 'string' && change.trim().length > 0)
        .map((change: string) => change.trim());

      return {
        improvedContent,
        changes,
      };
    } catch (error) {
      // Handle OpenAI API errors
      if (error instanceof OpenAI.APIError) {
        throw new Error(`OpenAI API error: ${error.message}`);
      }

      // Re-throw parsing errors
      if (error instanceof Error && error.message.includes('parse')) {
        throw error;
      }

      // Re-throw other errors
      throw error instanceof Error
        ? error
        : new Error('An unexpected error occurred during section improvement');
    }
  }

  /**
   * Calculate ATS compatibility score using AI for intelligent analysis
   * Provides detailed feedback on skills, experience, qualifications, and improvements
   */
  async calculateATSScore(
    resumeData: ResumeData | Record<string, never>,
    jobDescription: string,
    userId?: string
  ): Promise<{
    score: number;
    skillMatch: number;
    missingSkills: string[];
    keywordImprovements: string[];
    experienceAlignment: number;
  }> {
    // If resumeData is empty, return low score
    if (!resumeData || Object.keys(resumeData).length === 0) {
      return {
        score: 0,
        skillMatch: 0,
        missingSkills: [],
        keywordImprovements: [],
        experienceAlignment: 0,
      };
    }

    const structuredResumeData = resumeData as ResumeData;

    // Use AI for intelligent ATS analysis
    try {
      return await this.calculateATSScoreWithAI(structuredResumeData, jobDescription, userId);
    } catch (error) {
      console.error('AI ATS analysis failed, falling back to rule-based:', error);
      // Fallback to rule-based calculation if AI fails
      return await this.calculateATSScoreRuleBased(structuredResumeData, jobDescription);
    }
  }

  /**
   * AI-powered ATS score calculation with detailed analysis
   * @param resumeData - Resume data
   * @param jobDescription - Job description
   * @param userId - User ID for usage tracking (optional)
   */
  private async calculateATSScoreWithAI(
    resumeData: ResumeData,
    jobDescription: string,
    userId?: string
  ): Promise<{
    score: number;
    skillMatch: number;
    missingSkills: string[];
    keywordImprovements: string[];
    experienceAlignment: number;
  }> {
    // Validate OpenAI API key
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }

    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: apiKey,
    });

    // Format resume data for AI analysis
    const resumeText = this.formatResumeForAI(resumeData);

    const systemPrompt = `You are an expert ATS (Applicant Tracking System) analyst. Your task is to analyze a resume against a job description and provide a comprehensive compatibility score and detailed feedback.

CRITICAL REQUIREMENTS:
1. Analyze the resume's alignment with the job description across multiple dimensions
2. Identify missing skills, qualifications, and experience gaps
3. Provide specific, actionable improvement recommendations
4. Calculate accurate scores based on real ATS matching criteria
5. Be thorough but realistic in your assessment

Return your analysis as a JSON object with this exact structure:
{
  "score": <number 0-100>, // Overall ATS compatibility score
  "skillMatch": <number 0-100>, // Percentage of required skills found in resume
  "missingSkills": ["skill1", "skill2", ...], // List of missing critical skills
  "keywordImprovements": ["suggestion1", "suggestion2", ...], // Specific keyword/term improvements
  "experienceAlignment": <number 0-100>, // How well experience matches job requirements
  "analysis": {
    "strengths": ["strength1", "strength2", ...], // What the resume does well
    "weaknesses": ["weakness1", "weakness2", ...], // Areas that need improvement
    "missingQualifications": ["qual1", "qual2", ...], // Missing qualifications/requirements
    "experienceGaps": ["gap1", "gap2", ...], // Experience gaps or missing experience types
    "recommendations": ["rec1", "rec2", ...] // Specific actionable recommendations
  }
}`;

    const userPrompt = `JOB DESCRIPTION:
${jobDescription}

RESUME DATA:
${resumeText}

Analyze this resume against the job description and provide:
1. An overall ATS compatibility score (0-100)
2. Skill match percentage - how many required skills are present
3. Missing critical skills that should be added
4. Keyword improvements - specific terms/phrases to add for better ATS matching
5. Experience alignment score - how well the experience matches job requirements
6. Detailed analysis including strengths, weaknesses, missing qualifications, experience gaps, and specific recommendations

Focus on:
- Technical skills and tools mentioned in the job description
- Required qualifications (education, certifications, years of experience)
- Relevant experience and responsibilities
- Industry-specific keywords and terminology
- Soft skills and competencies mentioned

Return ONLY the JSON object, no additional text.`;

    try {
      const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      const response = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3, // Lower temperature for more consistent, analytical responses
        max_tokens: 2000, // Sufficient for comprehensive analysis
        response_format: { type: 'json_object' },
      });

      // Track usage if userId is provided
      if (userId && response.usage) {
        try {
          await openaiUsageService.trackUsageFromResponse(
            userId,
            'calculateATSScore',
            model,
            response,
            {}
          );
        } catch (usageError) {
          console.error('Failed to track OpenAI usage:', usageError);
          // Don't fail the request if usage tracking fails
        }
      }

      const responseContent = response.choices[0]?.message?.content?.trim() || '';
      if (!responseContent) {
        throw new Error('Empty response from OpenAI');
      }

      // Parse JSON response
      let aiAnalysis: any;
      try {
        aiAnalysis = JSON.parse(responseContent);
      } catch (parseError) {
        // Fallback: try to extract JSON from markdown code blocks
        const jsonMatch = responseContent.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
        if (jsonMatch) {
          aiAnalysis = JSON.parse(jsonMatch[1]);
        } else {
          throw new Error('Failed to parse OpenAI response as JSON');
        }
      }

      // Validate and extract data
      const score = Math.min(100, Math.max(0, Number(aiAnalysis.score) || 0));
      const skillMatch = Math.min(100, Math.max(0, Number(aiAnalysis.skillMatch) || 0));
      const experienceAlignment = Math.min(100, Math.max(0, Number(aiAnalysis.experienceAlignment) || 0));
      
      const missingSkills = Array.isArray(aiAnalysis.missingSkills) 
        ? aiAnalysis.missingSkills.filter((s: any) => typeof s === 'string' && s.trim().length > 0)
        : [];
      
      // Combine keyword improvements with recommendations for better suggestions
      const keywordImprovements: string[] = [];
      if (Array.isArray(aiAnalysis.keywordImprovements)) {
        keywordImprovements.push(...aiAnalysis.keywordImprovements.filter((k: any) => typeof k === 'string'));
      }
      if (aiAnalysis.analysis?.recommendations && Array.isArray(aiAnalysis.analysis.recommendations)) {
        // Add top recommendations as keyword improvements
        const topRecs = aiAnalysis.analysis.recommendations
          .slice(0, 5)
          .filter((r: any) => typeof r === 'string' && !keywordImprovements.includes(r));
        keywordImprovements.push(...topRecs);
      }

      return {
        score: Math.round(score),
        skillMatch: Math.round(skillMatch),
        missingSkills: missingSkills.slice(0, 15), // Limit to top 15 missing skills
        keywordImprovements: keywordImprovements.slice(0, 15), // Limit to top 15 improvements
        experienceAlignment: Math.round(experienceAlignment),
      };
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        throw new Error(`OpenAI API error: ${error.message}`);
      }
      throw error instanceof Error ? error : new Error('Failed to analyze resume with AI');
    }
  }

  /**
   * Format resume data for AI analysis
   */
  private formatResumeForAI(resumeData: ResumeData): string {
    const parts: string[] = [];

    // Contact information
    if (resumeData.contact) {
      parts.push('CONTACT INFORMATION:');
      if (resumeData.contact.name) parts.push(`Name: ${resumeData.contact.name}`);
      if (resumeData.contact.email) parts.push(`Email: ${resumeData.contact.email}`);
      if (resumeData.contact.phone) parts.push(`Phone: ${resumeData.contact.phone}`);
      if (resumeData.contact.location) parts.push(`Location: ${resumeData.contact.location}`);
      parts.push('');
    }

    // Summary
    if (resumeData.summary) {
      parts.push('PROFESSIONAL SUMMARY:');
      parts.push(resumeData.summary);
      parts.push('');
    }

    // Skills
    if (resumeData.skills && resumeData.skills.length > 0) {
      parts.push('SKILLS:');
      parts.push(resumeData.skills.join(', '));
      parts.push('');
    }

    // Experience
    if (resumeData.experience && resumeData.experience.length > 0) {
      parts.push('WORK EXPERIENCE:');
      resumeData.experience.forEach((exp) => {
        parts.push(`${exp.title} at ${exp.company}`);
        if (exp.location) parts.push(`Location: ${exp.location}`);
        parts.push(`Period: ${exp.startDate} - ${exp.endDate || (exp.current ? 'Present' : 'N/A')}`);
        if (exp.bullets && exp.bullets.length > 0) {
          exp.bullets.forEach((bullet) => parts.push(`• ${bullet}`));
        }
        parts.push('');
      });
    }

    // Projects
    if (resumeData.projects && resumeData.projects.length > 0) {
      parts.push('PROJECTS:');
      resumeData.projects.forEach((proj) => {
        parts.push(`${proj.name}`);
        if (proj.description) parts.push(`Description: ${proj.description}`);
        if (proj.technologies && proj.technologies.length > 0) {
          parts.push(`Technologies: ${proj.technologies.join(', ')}`);
        }
        if (proj.bullets && proj.bullets.length > 0) {
          proj.bullets.forEach((bullet) => parts.push(`• ${bullet}`));
        }
        parts.push('');
      });
    }

    // Education
    if (resumeData.education && resumeData.education.length > 0) {
      parts.push('EDUCATION:');
      resumeData.education.forEach((edu) => {
        parts.push(`${edu.degree} from ${edu.institution}`);
        if (edu.location) parts.push(`Location: ${edu.location}`);
        if (edu.graduationDate) parts.push(`Graduation: ${edu.graduationDate}`);
        if (edu.gpa) parts.push(`GPA: ${edu.gpa}`);
        if (edu.highlights && edu.highlights.length > 0) {
          edu.highlights.forEach((highlight) => parts.push(`• ${highlight}`));
        }
        parts.push('');
      });
    }

    return parts.join('\n');
  }

  /**
   * Fallback rule-based ATS score calculation
   */
  private async calculateATSScoreRuleBased(
    resumeData: ResumeData,
    jobDescription: string
  ): Promise<{
    score: number;
    skillMatch: number;
    missingSkills: string[];
    keywordImprovements: string[];
    experienceAlignment: number;
  }> {
    // Convert resume data to text for keyword analysis
    const resumeText = this.convertResumeDataToText(resumeData);
    
    // Normalize both texts (lowercase, remove stop words)
    const normalizedResume = this.normalizeText(resumeText);
    const normalizedJobDesc = this.normalizeText(jobDescription);
    
    // Extract keywords from job description
    const jobKeywords = this.extractKeywords(jobDescription);
    
    // Calculate keyword overlap percentage
    const keywordOverlap = this.calculateKeywordOverlap(normalizedResume, normalizedJobDesc, jobKeywords);
    
    // Extract skills from job description and compare with resume
    const jobSkills = this.extractSkillsFromJobDescription(jobDescription);
    const resumeSkills = this.getResumeSkills(resumeData);
    const skillMatch = this.calculateSkillMatch(resumeSkills, jobSkills);
    const missingSkills = this.findMissingSkills(resumeSkills, jobSkills);
    
    // Calculate experience alignment using structured data
    const experienceAlignment = this.calculateExperienceAlignment(resumeData, jobDescription);
    
    // Generate keyword improvement suggestions
    const keywordImprovements = this.generateKeywordImprovements(jobKeywords, normalizedResume);
    
    // Calculate overall score (weighted combination)
    // Keyword overlap: 40%, Skill match: 40%, Experience alignment: 20%
    const score = Math.round(
      keywordOverlap * 0.4 +
      skillMatch * 0.4 +
      experienceAlignment * 0.2
    );
    
    return {
      score: Math.min(100, Math.max(0, score)), // Ensure score is between 0-100
      skillMatch: Math.round(skillMatch),
      missingSkills,
      keywordImprovements,
      experienceAlignment: Math.round(experienceAlignment),
    };
  }
  
  /**
   * Convert structured resume data to plain text
   */
  private convertResumeDataToText(resumeData: ResumeData | Record<string, never>): string {
    if (!resumeData || Object.keys(resumeData).length === 0) {
      return '';
    }
    
    const data = resumeData as ResumeData;
    const textParts: string[] = [];
    
    // Add summary
    if (data.summary) {
      textParts.push(data.summary);
    }
    
    // Add skills
    if (data.skills && Array.isArray(data.skills)) {
      textParts.push(data.skills.join(', '));
    }
    
    // Add experience
    if (data.experience && Array.isArray(data.experience)) {
      data.experience.forEach((exp) => {
        textParts.push(`${exp.title} at ${exp.company}`);
        textParts.push(...exp.bullets);
      });
    }
    
    // Add projects
    if (data.projects && Array.isArray(data.projects)) {
      data.projects.forEach((proj) => {
        textParts.push(proj.name);
        textParts.push(proj.description);
        if (proj.technologies) {
          textParts.push(proj.technologies.join(', '));
        }
        textParts.push(...proj.bullets);
      });
    }
    
    // Add education
    if (data.education && Array.isArray(data.education)) {
      data.education.forEach((edu) => {
        textParts.push(`${edu.degree} from ${edu.institution}`);
        if (edu.highlights) {
          textParts.push(...edu.highlights);
        }
      });
    }
    
    return textParts.join(' ');
  }
  
  /**
   * Normalize text: lowercase, remove stop words, clean punctuation
   */
  private normalizeText(text: string): string {
    // Common stop words to remove
    const stopWords = new Set([
      'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
      'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
      'to', 'was', 'were', 'will', 'with', 'the', 'this', 'but', 'they',
      'have', 'had', 'what', 'said', 'each', 'which', 'their', 'time',
      'if', 'up', 'out', 'many', 'then', 'them', 'these', 'so', 'some',
      'her', 'would', 'make', 'like', 'into', 'him', 'has', 'two', 'more',
      'very', 'after', 'words', 'long', 'than', 'first', 'been', 'call',
      'who', 'oil', 'sit', 'now', 'find', 'down', 'day', 'did', 'get',
      'come', 'made', 'may', 'part', 'over', 'new', 'sound', 'take', 'only',
      'little', 'work', 'know', 'place', 'year', 'live', 'me', 'back', 'give',
      'most', 'very', 'after', 'thing', 'our', 'just', 'name', 'good', 'sentence',
      'man', 'think', 'say', 'great', 'where', 'help', 'through', 'much', 'before',
      'line', 'right', 'too', 'means', 'old', 'any', 'same', 'tell', 'boy', 'follow',
      'came', 'want', 'show', 'also', 'around', 'form', 'three', 'small', 'set',
      'put', 'end', 'does', 'another', 'well', 'large', 'must', 'big', 'even',
      'such', 'because', 'turn', 'here', 'why', 'ask', 'went', 'men', 'read',
      'need', 'land', 'different', 'home', 'us', 'move', 'try', 'kind', 'hand',
      'picture', 'again', 'change', 'off', 'play', 'spell', 'air', 'away', 'animal',
      'house', 'point', 'page', 'letter', 'mother', 'answer', 'found', 'study', 'still',
      'learn', 'should', 'america', 'world', 'high', 'every', 'near', 'add', 'food',
      'between', 'own', 'below', 'country', 'plant', 'last', 'school', 'father', 'keep',
      'tree', 'never', 'start', 'city', 'earth', 'eye', 'light', 'thought', 'head',
      'under', 'story', 'saw', 'left', 'don\'t', 'few', 'while', 'along', 'might',
      'close', 'something', 'seem', 'next', 'hard', 'open', 'example', 'begin', 'life',
      'always', 'those', 'both', 'paper', 'together', 'got', 'group', 'often', 'run',
      'important', 'until', 'children', 'side', 'feet', 'car', 'mile', 'night', 'walk',
      'white', 'sea', 'began', 'grow', 'took', 'river', 'four', 'carry', 'state',
      'once', 'book', 'hear', 'stop', 'without', 'second', 'later', 'miss', 'idea',
      'enough', 'eat', 'face', 'watch', 'far', 'indian', 'real', 'almost', 'let',
      'above', 'girl', 'sometimes', 'mountain', 'cut', 'young', 'talk', 'soon', 'list',
      'song', 'leave', 'family', 'it\'s'
    ]);
    
    // Convert to lowercase and split into words
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
      .split(/\s+/)
      .filter((word) => word.length > 2 && !stopWords.has(word)); // Remove short words and stop words
    
    return words.join(' ');
  }
  
  /**
   * Extract keywords from job description
   * Keywords are: nouns, technical terms, skills, and important phrases
   */
  private extractKeywords(jobDescription: string): string[] {
    const normalized = this.normalizeText(jobDescription);
    const words = normalized.split(/\s+/);
    
    // Count word frequency
    const wordFreq = new Map<string, number>();
    words.forEach((word) => {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    });
    
    // Extract keywords: words that appear multiple times or are technical terms
    // Technical terms are usually longer words (>4 chars) or common tech terms
    const techTerms = new Set([
      'javascript', 'python', 'java', 'typescript', 'react', 'angular', 'vue',
      'node', 'express', 'sql', 'mongodb', 'postgresql', 'mysql', 'aws', 'azure',
      'docker', 'kubernetes', 'git', 'agile', 'scrum', 'api', 'rest', 'graphql',
      'microservices', 'devops', 'ci', 'cd', 'linux', 'unix', 'html', 'css',
      'sass', 'less', 'redux', 'mobx', 'jest', 'testing', 'tdd', 'bdd'
    ]);
    
    const keywords: string[] = [];
    wordFreq.forEach((freq, word) => {
      // Include if: appears 2+ times, is a tech term, or is longer than 5 chars
      if (freq >= 2 || techTerms.has(word) || word.length > 5) {
        keywords.push(word);
      }
    });
    
    return [...new Set(keywords)]; // Remove duplicates
  }
  
  /**
   * Calculate keyword overlap percentage between resume and job description
   */
  private calculateKeywordOverlap(
    normalizedResume: string,
    _normalizedJobDesc: string,
    jobKeywords: string[]
  ): number {
    if (jobKeywords.length === 0) {
      return 0;
    }
    
    const resumeWords = new Set(normalizedResume.split(/\s+/));
    const matchedKeywords = jobKeywords.filter((keyword) => resumeWords.has(keyword));
    
    // Calculate percentage of job keywords found in resume
    return (matchedKeywords.length / jobKeywords.length) * 100;
  }
  
  /**
   * Extract skills from job description
   */
  private extractSkillsFromJobDescription(jobDescription: string): string[] {
    // Use similar pattern matching as resume skills extraction
    const skills: string[] = [];
    
    // Common patterns for skills in job descriptions
    const skillPatterns = [
      /(?:required|required skills?|qualifications?|requirements?|skills?)[:\s\n]+(.*?)(?=\n\n|\n(?:experience|education|responsibilities|duties)|$)/is,
      /(?:technical skills?|core competencies?|key skills?)[:\s\n]+(.*?)(?=\n\n|\n(?:experience|education|responsibilities|duties)|$)/is,
    ];
    
    for (const pattern of skillPatterns) {
      const match = jobDescription.match(pattern);
      if (match && match[1]) {
        const extracted = match[1]
          .split(/[,\n•\-\*\|]/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0 && s.length < 50);
        skills.push(...extracted);
        break;
      }
    }
    
    // Also extract technical terms from the entire description
    const techTerms = this.extractKeywords(jobDescription);
    skills.push(...techTerms);
    
    return [...new Set(skills.map((s) => s.toLowerCase()))]; // Normalize and remove duplicates
  }
  
  /**
   * Get skills from resume data
   */
  private getResumeSkills(resumeData: ResumeData | Record<string, never>): string[] {
    if (!resumeData || Object.keys(resumeData).length === 0) {
      return [];
    }
    
    const data = resumeData as ResumeData;
    const skills: string[] = [];
    
    // Get skills from skills array
    if (data.skills && Array.isArray(data.skills)) {
      skills.push(...data.skills.map((s) => s.toLowerCase().trim()));
    }
    
    // Also extract skills from projects (technologies)
    if (data.projects && Array.isArray(data.projects)) {
      data.projects.forEach((proj) => {
        if (proj.technologies) {
          skills.push(...proj.technologies.map((t) => t.toLowerCase().trim()));
        }
      });
    }
    
    return [...new Set(skills)];
  }
  
  /**
   * Calculate skill match percentage
   */
  private calculateSkillMatch(resumeSkills: string[], jobSkills: string[]): number {
    if (jobSkills.length === 0) {
      return 0;
    }
    
    // Normalize skills for comparison (fuzzy matching for similar skills)
    const normalizedResume = new Set(resumeSkills);
    
    // Direct matches
    const matches = jobSkills.filter((jobSkill) => {
      // Exact match
      if (normalizedResume.has(jobSkill)) {
        return true;
      }
      // Fuzzy match: check if any resume skill contains the job skill or vice versa
      return Array.from(normalizedResume).some((resumeSkill) => {
        return resumeSkill.includes(jobSkill) || jobSkill.includes(resumeSkill);
      });
    });
    
    return (matches.length / jobSkills.length) * 100;
  }
  
  /**
   * Find missing skills in resume compared to job description
   */
  private findMissingSkills(resumeSkills: string[], jobSkills: string[]): string[] {
    const normalizedResume = new Set(resumeSkills);
    
    return jobSkills.filter((jobSkill) => {
      // Check exact match
      if (normalizedResume.has(jobSkill)) {
        return false;
      }
      // Check fuzzy match
      return !Array.from(normalizedResume).some((resumeSkill) => {
        return resumeSkill.includes(jobSkill) || jobSkill.includes(resumeSkill);
      });
    });
  }
  
  /**
   * Calculate experience alignment based on job titles and responsibilities
   */
  private calculateExperienceAlignment(
    resumeData: ResumeData | Record<string, never>,
    jobDescription: string
  ): number {
    if (!resumeData || Object.keys(resumeData).length === 0) {
      return 0;
    }
    
    const data = resumeData as ResumeData;
    if (!data.experience || data.experience.length === 0) {
      return 0;
    }
    
    // Extract job title from job description (look for patterns like "Software Engineer", "Developer", etc.)
    const jobTitlePatterns = [
      /(?:position|role|title|looking for|seeking)[:\s]+([a-z\s]+?)(?:\.|,|\n|$)/i,
      /^([a-z\s]+?)(?:\s+(?:engineer|developer|manager|analyst|specialist|coordinator|director|lead|senior|junior))/i,
    ];
    
    let jobTitle = '';
    for (const pattern of jobTitlePatterns) {
      const match = jobDescription.match(pattern);
      if (match && match[1]) {
        jobTitle = match[1].trim().toLowerCase();
        break;
      }
    }
    
    // Calculate alignment based on:
    // 1. Job title similarity (40%)
    // 2. Keyword overlap in experience descriptions (60%)
    let titleMatch = 0;
    let experienceKeywordMatch = 0;
    
    if (jobTitle) {
      // Check if any resume experience title contains job title keywords
      const jobTitleWords = jobTitle.split(/\s+/).filter((w) => w.length > 3);
      data.experience.forEach((exp) => {
        const expTitle = exp.title.toLowerCase();
        const matchedWords = jobTitleWords.filter((word) => expTitle.includes(word));
        titleMatch = Math.max(titleMatch, (matchedWords.length / jobTitleWords.length) * 100);
      });
    }
    
    // Check keyword overlap in experience descriptions
    const jobKeywords = this.extractKeywords(jobDescription);
    if (jobKeywords.length > 0) {
      const expTexts = data.experience
        .flatMap((exp) => [exp.title, exp.company, ...exp.bullets])
        .join(' ')
        .toLowerCase();
      
      const matchedKeywords = jobKeywords.filter((keyword) => expTexts.includes(keyword));
      experienceKeywordMatch = (matchedKeywords.length / jobKeywords.length) * 100;
    }
    
    // Weighted combination
    return titleMatch * 0.4 + experienceKeywordMatch * 0.6;
  }
  
  /**
   * Generate keyword improvement suggestions
   */
  private generateKeywordImprovements(jobKeywords: string[], normalizedResume: string): string[] {
    const resumeWords = new Set(normalizedResume.split(/\s+/));
    const missingKeywords = jobKeywords.filter((keyword) => !resumeWords.has(keyword));
    
    // Return top 10 missing keywords as improvement suggestions
    return missingKeywords.slice(0, 10);
  }

  /**
   * Generate PDF or LaTeX file for resume
   */
  async generateResumeFile(
    resumeData: ResumeData,
    format: 'pdf' | 'latex'
  ): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
    if (format === 'latex') {
      return this.generateLaTeXFile(resumeData);
    } else {
      return this.generatePDFFile(resumeData);
    }
  }

  /**
   * Generate LaTeX file from resume data
   */
  private async generateLaTeXFile(resumeData: ResumeData): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
    const latexContent = this.convertResumeToLaTeX(resumeData);
    const buffer = Buffer.from(latexContent, 'utf-8');
    
    return {
      buffer,
      filename: 'resume.tex',
      mimeType: 'application/x-latex',
    };
  }

  /**
   * Convert resume data to LaTeX format
   */
  private convertResumeToLaTeX(resumeData: ResumeData): string {
    const parts: string[] = [];
    
    parts.push('\\documentclass[11pt,a4paper]{article}');
    parts.push('\\usepackage[utf8]{inputenc}');
    parts.push('\\usepackage[margin=0.75in]{geometry}');
    parts.push('\\usepackage{enumitem}');
    parts.push('\\usepackage{titlesec}');
    parts.push('\\usepackage{hyperref}');
    parts.push('');
    parts.push('\\titleformat{\\section}{\\large\\bfseries}{}{0em}{}[\\titlerule]');
    parts.push('\\titlespacing{\\section}{0pt}{12pt}{6pt}');
    parts.push('');
    parts.push('\\begin{document}');
    parts.push('');

    // Contact Information
    if (resumeData.contact) {
      const contact = resumeData.contact;
      parts.push('\\begin{center}');
      if (contact.name) parts.push(`\\textbf{\\Large ${this.escapeLaTeX(contact.name)}}\\\\`);
      if (contact.email) parts.push(`\\href{mailto:${contact.email}}{${this.escapeLaTeX(contact.email)}}`);
      if (contact.phone) parts.push(`$|$ ${this.escapeLaTeX(contact.phone)}`);
      if (contact.location) parts.push(`$|$ ${this.escapeLaTeX(contact.location)}`);
      if (contact.linkedin) parts.push(`$|$ \\href{${contact.linkedin}}{LinkedIn}`);
      if (contact.github) parts.push(`$|$ \\href{${contact.github}}{GitHub}`);
      if (contact.portfolio) parts.push(`$|$ \\href{${contact.portfolio}}{Portfolio}`);
      parts.push('\\end{center}');
      parts.push('');
    }

    // Summary
    if (resumeData.summary) {
      parts.push('\\section*{Professional Summary}');
      parts.push(this.escapeLaTeX(resumeData.summary));
      parts.push('');
    }

    // Skills
    if (resumeData.skills && resumeData.skills.length > 0) {
      parts.push('\\section*{Skills}');
      parts.push('\\begin{itemize}[leftmargin=*,nosep]');
      resumeData.skills.forEach((skill) => {
        parts.push(`  \\item ${this.escapeLaTeX(skill)}`);
      });
      parts.push('\\end{itemize}');
      parts.push('');
    }

    // Experience
    if (resumeData.experience && resumeData.experience.length > 0) {
      parts.push('\\section*{Experience}');
      resumeData.experience.forEach((exp) => {
        parts.push(`\\textbf{${this.escapeLaTeX(exp.title)}} $|$ \\textit{${this.escapeLaTeX(exp.company)}}`);
        if (exp.location) parts.push(`$|$ ${this.escapeLaTeX(exp.location)}`);
        parts.push(`\\\\`);
        parts.push(`\\textit{${this.escapeLaTeX(exp.startDate)} - ${this.escapeLaTeX(exp.endDate || (exp.current ? 'Present' : ''))}}`);
        if (exp.bullets && exp.bullets.length > 0) {
          parts.push('\\begin{itemize}[leftmargin=*,nosep]');
          exp.bullets.forEach((bullet) => {
            parts.push(`  \\item ${this.escapeLaTeX(bullet)}`);
          });
          parts.push('\\end{itemize}');
        }
        parts.push('');
      });
    }

    // Projects
    if (resumeData.projects && resumeData.projects.length > 0) {
      parts.push('\\section*{Projects}');
      resumeData.projects.forEach((proj) => {
        parts.push(`\\textbf{${this.escapeLaTeX(proj.name)}}`);
        if (proj.link) parts.push(` - \\href{${proj.link}}{${proj.link}}`);
        parts.push(`\\\\`);
        if (proj.description) parts.push(`\\textit{${this.escapeLaTeX(proj.description)}}\\\\`);
        if (proj.technologies && proj.technologies.length > 0) {
          parts.push(`Technologies: ${proj.technologies.map(t => this.escapeLaTeX(t)).join(', ')}`);
        }
        if (proj.bullets && proj.bullets.length > 0) {
          parts.push('\\begin{itemize}[leftmargin=*,nosep]');
          proj.bullets.forEach((bullet) => {
            parts.push(`  \\item ${this.escapeLaTeX(bullet)}`);
          });
          parts.push('\\end{itemize}');
        }
        parts.push('');
      });
    }

    // Education
    if (resumeData.education && resumeData.education.length > 0) {
      parts.push('\\section*{Education}');
      resumeData.education.forEach((edu) => {
        parts.push(`\\textbf{${this.escapeLaTeX(edu.degree)}} $|$ \\textit{${this.escapeLaTeX(edu.institution)}}`);
        if (edu.location) parts.push(`$|$ ${this.escapeLaTeX(edu.location)}`);
        parts.push(`\\\\`);
        parts.push(`\\textit{${this.escapeLaTeX(edu.graduationDate)}}`);
        if (edu.gpa) parts.push(`$|$ GPA: ${this.escapeLaTeX(edu.gpa)}`);
        if (edu.highlights && edu.highlights.length > 0) {
          parts.push('\\begin{itemize}[leftmargin=*,nosep]');
          edu.highlights.forEach((highlight) => {
            parts.push(`  \\item ${this.escapeLaTeX(highlight)}`);
          });
          parts.push('\\end{itemize}');
        }
        parts.push('');
      });
    }

    parts.push('\\end{document}');
    
    return parts.join('\n');
  }

  /**
   * Escape special LaTeX characters
   */
  private escapeLaTeX(text: string): string {
    if (!text) return '';
    return text
      .replace(/\\/g, '\\textbackslash{}')
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}')
      .replace(/\$/g, '\\$')
      .replace(/\&/g, '\\&')
      .replace(/\#/g, '\\#')
      .replace(/\^/g, '\\textasciicircum{}')
      .replace(/\_/g, '\\_')
      .replace(/\~/g, '\\textasciitilde{}')
      .replace(/\%/g, '\\%');
  }

  /**
   * Generate PDF file from resume data
   */
  private async generatePDFFile(resumeData: ResumeData): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
    // Use pdfkit for PDF generation
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    
    return new Promise((resolve, reject) => {
      doc.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          buffer,
          filename: 'resume.pdf',
          mimeType: 'application/pdf',
        });
      });

      doc.on('error', reject);

      // Add content
      this.addPDFContent(doc, resumeData);
      
      doc.end();
    });
  }

  /**
   * Add content to PDF document
   */
  private addPDFContent(doc: any, resumeData: ResumeData): void {
    // Title/Name
    if (resumeData.contact?.name) {
      doc.fontSize(24).font('Helvetica-Bold').text(resumeData.contact.name, { align: 'center' });
      doc.moveDown(0.5);
    }

    // Contact Information
    if (resumeData.contact) {
      const contact = resumeData.contact;
      const contactInfo: string[] = [];
      if (contact.email) contactInfo.push(contact.email);
      if (contact.phone) contactInfo.push(contact.phone);
      if (contact.location) contactInfo.push(contact.location);
      if (contact.linkedin) contactInfo.push(`LinkedIn: ${contact.linkedin}`);
      if (contact.github) contactInfo.push(`GitHub: ${contact.github}`);
      if (contact.portfolio) contactInfo.push(`Portfolio: ${contact.portfolio}`);
      
      doc.fontSize(10).font('Helvetica').text(contactInfo.join(' | '), { align: 'center' });
      doc.moveDown(1);
    }

    // Summary
    if (resumeData.summary) {
      doc.fontSize(14).font('Helvetica-Bold').text('PROFESSIONAL SUMMARY');
      doc.moveDown(0.3);
      doc.fontSize(11).font('Helvetica').text(resumeData.summary, { align: 'justify' });
      doc.moveDown(1);
    }

    // Skills
    if (resumeData.skills && resumeData.skills.length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').text('SKILLS');
      doc.moveDown(0.3);
      doc.fontSize(11).font('Helvetica').text(resumeData.skills.join(' • '));
      doc.moveDown(1);
    }

    // Experience
    if (resumeData.experience && resumeData.experience.length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').text('EXPERIENCE');
      doc.moveDown(0.5);
      
      resumeData.experience.forEach((exp) => {
        doc.fontSize(12).font('Helvetica-Bold').text(exp.title);
        doc.fontSize(11).font('Helvetica').text(`${exp.company}${exp.location ? ` | ${exp.location}` : ''}`, { continued: true });
        doc.fontSize(10).font('Helvetica-Oblique').text(` | ${exp.startDate} - ${exp.endDate || (exp.current ? 'Present' : '')}`);
        doc.moveDown(0.3);
        
        if (exp.bullets && exp.bullets.length > 0) {
          exp.bullets.forEach((bullet) => {
            doc.fontSize(10).font('Helvetica').text(`• ${bullet}`, { indent: 20 });
          });
        }
        doc.moveDown(0.5);
      });
    }

    // Projects
    if (resumeData.projects && resumeData.projects.length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').text('PROJECTS');
      doc.moveDown(0.5);
      
      resumeData.projects.forEach((proj) => {
        doc.fontSize(12).font('Helvetica-Bold').text(proj.name);
        if (proj.link) {
          doc.fontSize(10).font('Helvetica').text(proj.link, { link: proj.link });
        }
        if (proj.description) {
          doc.fontSize(10).font('Helvetica-Oblique').text(proj.description);
        }
        if (proj.technologies && proj.technologies.length > 0) {
          doc.fontSize(10).font('Helvetica').text(`Technologies: ${proj.technologies.join(', ')}`);
        }
        doc.moveDown(0.3);
        
        if (proj.bullets && proj.bullets.length > 0) {
          proj.bullets.forEach((bullet) => {
            doc.fontSize(10).font('Helvetica').text(`• ${bullet}`, { indent: 20 });
          });
        }
        doc.moveDown(0.5);
      });
    }

    // Education
    if (resumeData.education && resumeData.education.length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').text('EDUCATION');
      doc.moveDown(0.5);
      
      resumeData.education.forEach((edu) => {
        doc.fontSize(12).font('Helvetica-Bold').text(edu.degree);
        doc.fontSize(11).font('Helvetica').text(`${edu.institution}${edu.location ? ` | ${edu.location}` : ''}`, { continued: true });
        doc.fontSize(10).font('Helvetica-Oblique').text(` | ${edu.graduationDate}${edu.gpa ? ` | GPA: ${edu.gpa}` : ''}`);
        doc.moveDown(0.3);
        
        if (edu.highlights && edu.highlights.length > 0) {
          edu.highlights.forEach((highlight) => {
            doc.fontSize(10).font('Helvetica').text(`• ${highlight}`, { indent: 20 });
          });
        }
        doc.moveDown(0.5);
      });
    }
  }
}

export default new ResumeService();
