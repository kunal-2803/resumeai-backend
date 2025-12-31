/**
 * Modular prompt builder for resume generation
 * Keeps prompts reusable and maintainable
 */

interface ResumeGenerationPromptParams {
  resumeText: string;
  jobDescription: string;
  outputType: 'latex' | 'direct';
}

/**
 * Build the system prompt for resume generation
 */
export function buildResumeSystemPrompt(): string {
  return `You are an expert resume writer specializing in creating ATS-friendly resumes. Your task is to optimize resume content for Applicant Tracking Systems while maintaining authenticity and accuracy.

CRITICAL RULES:
1. NEVER fabricate, invent, or add any experience, skills, education, or achievements that are not in the original resume
2. Only rewrite, rephrase, and optimize existing content from the original resume
3. Use industry-standard keywords and terminology from the job description where they naturally fit
4. Maintain all factual information (company names, dates, job titles, degrees, etc.) exactly as provided
5. Use a single-column, ATS-safe format with clear section headers
6. Optimize bullet points to be action-oriented and keyword-rich
7. Ensure technical terms match the job description terminology (e.g., "React" vs "React.js")
8. Keep the resume professional, concise, and scannable by ATS systems
9. Use standard section headers: Summary/Objective, Skills, Experience, Education, Projects (if applicable)

FORMATTING GUIDELINES:
- Use clear section headers in ALL CAPS or Title Case
- Use bullet points (• or -) for experience descriptions
- Keep bullet points concise (1-2 lines each)
- Use consistent date formatting (Month YYYY - Month YYYY or Month YYYY - Present)
- Include location information when available
- Separate sections with clear spacing

Your output should be the optimized resume content ONLY, without any explanations or meta-commentary.`;
}

/**
 * Build the user prompt for resume generation
 */
export function buildResumeUserPrompt(params: ResumeGenerationPromptParams): string {
  const { resumeText, jobDescription, outputType } = params;

  const formatInstructions = outputType === 'latex'
    ? `\n\nOUTPUT FORMAT: Generate the resume in LaTeX format. Use standard LaTeX resume packages (like moderncv or resume style). Include proper LaTeX document structure with \\begin{document} and \\end{document}.`
    : `\n\nOUTPUT FORMAT: Generate the resume in plain text format with clear formatting. Use simple text-based formatting (headers, bullet points, spacing) that is ATS-friendly. No HTML tags or complex markup.`;

  return `ORIGINAL RESUME CONTENT:
${resumeText}

TARGET JOB DESCRIPTION:
${jobDescription}
${formatInstructions}

Generate an ATS-optimized version of this resume that aligns with the job description. Remember to:
- Only use information present in the original resume
- Optimize keywords and phrasing for ATS compatibility
- Maintain single-column format
- Keep all factual details accurate
- Use industry-standard terminology from the job description where appropriate`;
}

/**
 * Build complete prompt messages for OpenAI API
 */
export function buildResumeGenerationMessages(params: ResumeGenerationPromptParams) {
  return [
    {
      role: 'system' as const,
      content: buildResumeSystemPrompt(),
    },
    {
      role: 'user' as const,
      content: buildResumeUserPrompt(params),
    },
  ];
}

/**
 * Section improvement prompt builder
 */

interface SectionImprovementPromptParams {
  sectionType: 'summary' | 'skills' | 'experience' | 'projects' | 'education';
  sectionContent: string;
  jobDescription: string;
}

/**
 * Get section-specific improvement guidelines
 */
function getSectionSpecificGuidelines(sectionType: string): string {
  const guidelines: Record<string, string> = {
    summary: `- Write 2-4 sentences that highlight key qualifications
- Start with your professional title or years of experience
- Include your strongest skills or achievements
- Make it keyword-rich and tailored to the job
- Use active voice and confident language`,
    skills: `- List skills in order of relevance to the job description
- Use exact terminology from the job description when possible
- Group related skills together
- Include both technical and soft skills if applicable
- Keep the format consistent (bullet points or comma-separated)`,
    experience: `- Start each bullet point with a strong action verb
- Quantify achievements with numbers, percentages, or metrics when possible
- Focus on results and impact, not just responsibilities
- Use keywords from the job description naturally
- Keep bullet points concise (1-2 lines each)`,
    projects: `- Clearly describe the project's purpose and your role
- Highlight technologies and tools used
- Emphasize measurable outcomes or impact
- Connect project work to job requirements
- Keep descriptions concise and impactful`,
    education: `- Include relevant coursework or honors if applicable
- Mention GPA only if it's strong (3.5+)
- Highlight relevant academic achievements
- Keep format consistent with other sections`,
  };

  return guidelines[sectionType] || '';
}

/**
 * Build the system prompt for section improvement
 */
export function buildSectionImprovementSystemPrompt(): string {
  return `You are an expert resume writer specializing in improving resume sections for ATS compatibility and clarity. Your task is to enhance resume sections while maintaining complete accuracy and authenticity.

CRITICAL RULES:
1. NEVER fabricate, invent, or add any experience, skills, achievements, or facts that are not in the original content
2. Only improve clarity, wording, and ATS alignment of existing information
3. Keep ALL factual information unchanged (names, dates, numbers, companies, institutions, etc.)
4. Use industry-standard keywords and terminology from the job description where they naturally fit
5. Improve readability and impact while maintaining truthfulness
6. Make content more action-oriented and results-focused
7. Optimize for ATS keyword matching without keyword stuffing

Your response must be in JSON format:
{
  "improvedContent": "the improved section content",
  "changes": ["brief description of change 1", "brief description of change 2", ...]
}

Keep the changes list concise - maximum 5-7 items, each in one short sentence.`;
}

/**
 * Build the user prompt for section improvement
 */
export function buildSectionImprovementUserPrompt(params: SectionImprovementPromptParams): string {
  const { sectionType, sectionContent, jobDescription } = params;
  const sectionGuidelines = getSectionSpecificGuidelines(sectionType);

  return `SECTION TYPE: ${sectionType.toUpperCase()}

ORIGINAL SECTION CONTENT:
${sectionContent}

TARGET JOB DESCRIPTION:
${jobDescription}

${sectionGuidelines ? `SECTION-SPECIFIC GUIDELINES:\n${sectionGuidelines}\n\n` : ''}Improve this resume section for clarity and ATS alignment. Remember:
- Keep all facts exactly the same
- Only improve wording, structure, and keyword usage
- Do not add any new information or experiences
- Make it more impactful and ATS-friendly
- Return JSON with improvedContent and changes array`;
}

/**
 * Build complete prompt messages for section improvement
 */
export function buildSectionImprovementMessages(params: SectionImprovementPromptParams) {
  return [
    {
      role: 'system' as const,
      content: buildSectionImprovementSystemPrompt(),
    },
    {
      role: 'user' as const,
      content: buildSectionImprovementUserPrompt(params),
    },
  ];
}
