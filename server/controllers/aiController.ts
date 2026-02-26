import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { qwenService } from '../services/qwen.js';
import { pdfParserService } from '../services/pdfParser.js';
import { Candidate } from '../db/models/Candidate.js';
import { CvFile } from '../db/models/CvFile.js';
import { CandidateMatrix } from '../db/models/CandidateMatrix.js';
import { Job } from '../db/models/Job.js';
import { CompanyProfile } from '../db/models/CompanyProfile.js';

/**
 * Helper: get CV text for a candidate (reads from the PDF file on disk).
 */
async function getCvTextForCandidate(candidateId: string): Promise<string> {
  const cvFile = await CvFile.findOne({
    where: { candidate_id: candidateId },
    order: [['uploaded_at', 'DESC']],
  });

  if (!cvFile || !cvFile.file_path) {
    throw new Error('No CV found for this candidate. Please upload a CV first.');
  }

  return pdfParserService.extractText(cvFile.file_path);
}

export class AiController {
  // ============================================================
  //  6.1  CV Review / Fixer (Candidate)
  // ============================================================
  async reviewCv(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const { targetRole } = req.body || {};

      const candidate = await Candidate.findOne({ where: { user_id: userId } });
      if (!candidate) return res.status(404).json({ message: 'Candidate profile not found' });

      const cvText = await getCvTextForCandidate(candidate.id);
      const result = await qwenService.reviewCV(cvText, targetRole);

      return res.json(result);
    } catch (error: any) {
      console.error('[AI] CV Review failed:', error.message);
      return res.status(500).json({ message: error.message || 'CV review failed' });
    }
  }

  // ============================================================
  //  6.2  CV Tailor for Specific Job (Candidate)
  // ============================================================
  async tailorCv(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const { jobId } = req.body;

      if (!jobId) return res.status(400).json({ message: 'jobId is required' });

      const candidate = await Candidate.findOne({ where: { user_id: userId } });
      if (!candidate) return res.status(404).json({ message: 'Candidate profile not found' });

      const job = await Job.findByPk(jobId);
      if (!job) return res.status(404).json({ message: 'Job not found' });

      const cvText = await getCvTextForCandidate(candidate.id);

      const result = await qwenService.tailorCV(
        cvText,
        job.title,
        job.description,
        [...(job.must_have_skills || []), ...(job.nice_to_have_skills || [])]
      );

      return res.json(result);
    } catch (error: any) {
      console.error('[AI] CV Tailor failed:', error.message);
      return res.status(500).json({ message: error.message || 'CV tailoring failed' });
    }
  }

  // ============================================================
  //  6.3  Cover Letter Writer (Candidate)
  // ============================================================
  async generateCoverLetter(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const { jobId, tone } = req.body;

      if (!jobId) return res.status(400).json({ message: 'jobId is required' });

      const candidate = await Candidate.findOne({ where: { user_id: userId } });
      if (!candidate) return res.status(404).json({ message: 'Candidate profile not found' });

      const job = await Job.findByPk(jobId, {
        include: [{ model: CompanyProfile, as: 'companyProfile' }],
      });
      if (!job) return res.status(404).json({ message: 'Job not found' });

      const cvText = await getCvTextForCandidate(candidate.id);
      const companyName = (job as any).companyProfile?.company_name || job.company || 'the company';

      const result = await qwenService.generateCoverLetter(
        cvText,
        job.title,
        job.description,
        companyName,
        tone || 'formal'
      );

      return res.json(result);
    } catch (error: any) {
      console.error('[AI] Cover letter generation failed:', error.message);
      return res.status(500).json({ message: error.message || 'Cover letter generation failed' });
    }
  }

  // ============================================================
  //  6.4  Job Posting Fixer / Optimizer (Company)
  // ============================================================
  async reviewJobPosting(req: AuthRequest, res: Response) {
    try {
      const { title, description, mustHaveSkills, niceToHaveSkills } = req.body;

      if (!title || !description) {
        return res.status(400).json({ message: 'title and description are required' });
      }

      const result = await qwenService.reviewJobPosting(
        title,
        description,
        mustHaveSkills || [],
        niceToHaveSkills || []
      );

      return res.json(result);
    } catch (error: any) {
      console.error('[AI] Job posting review failed:', error.message);
      return res.status(500).json({ message: error.message || 'Job posting review failed' });
    }
  }

  // ============================================================
  //  6.5  Job Description Generator (Company)
  // ============================================================
  async generateJobDescription(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const { title, skills, seniorityLevel, locationType, industry } = req.body;

      if (!title) return res.status(400).json({ message: 'title is required' });

      // Optionally fetch company description
      const company = await CompanyProfile.findOne({ where: { user_id: userId } });
      const companyDescription = company?.description || undefined;

      const result = await qwenService.generateJobDescription(
        title,
        skills,
        seniorityLevel,
        locationType,
        industry,
        companyDescription
      );

      return res.json(result);
    } catch (error: any) {
      console.error('[AI] Job description generation failed:', error.message);
      return res.status(500).json({ message: error.message || 'Job description generation failed' });
    }
  }

  // ============================================================
  //  6.6  Interview Question Generator (Company)
  // ============================================================
  async generateInterviewQuestions(req: AuthRequest, res: Response) {
    try {
      const { jobId, candidateId, questionTypes, difficulty } = req.body;

      if (!jobId) return res.status(400).json({ message: 'jobId is required' });

      const job = await Job.findByPk(jobId);
      if (!job) return res.status(404).json({ message: 'Job not found' });

      // Ensure company users can only generate interview questions for their own jobs
      if (req.user?.role === 'company') {
        const company = await CompanyProfile.findOne({ where: { user_id: req.user.id } });
        if (!company || job.company_id !== company.id) {
          return res.status(403).json({ message: 'Access denied: this job does not belong to your company' });
        }
      }

      let cvText: string | undefined;
      if (candidateId) {
        try {
          cvText = await getCvTextForCandidate(candidateId);
        } catch {
          // If CV not found for candidate, generate generic questions
          cvText = undefined;
        }
      }

      const result = await qwenService.generateInterviewQuestions(
        job.title,
        job.description,
        [...(job.must_have_skills || []), ...(job.nice_to_have_skills || [])],
        cvText,
        questionTypes || ['technical', 'behavioral', 'situational'],
        difficulty || 'mixed'
      );

      return res.json(result);
    } catch (error: any) {
      console.error('[AI] Interview questions generation failed:', error.message);
      return res.status(500).json({ message: error.message || 'Interview questions generation failed' });
    }
  }

  // ============================================================
  //  6.7  Candidate Summary / Pitch Generator (Company)
  // ============================================================
  async generateCandidateSummary(req: AuthRequest, res: Response) {
    try {
      const { candidateId, jobId } = req.body;

      if (!candidateId || !jobId) {
        return res.status(400).json({ message: 'candidateId and jobId are required' });
      }

      const candidate = await Candidate.findByPk(candidateId);
      if (!candidate) return res.status(404).json({ message: 'Candidate not found' });

      const job = await Job.findByPk(jobId);
      if (!job) return res.status(404).json({ message: 'Job not found' });

      const cvText = await getCvTextForCandidate(candidateId);

      const result = await qwenService.generateCandidateSummary(
        candidate.name,
        cvText,
        job.title,
        job.description
      );

      return res.json(result);
    } catch (error: any) {
      console.error('[AI] Candidate summary generation failed:', error.message);
      return res.status(500).json({ message: error.message || 'Candidate summary generation failed' });
    }
  }

  // ============================================================
  //  6.8  Skill Gap Analysis (Candidate)
  // ============================================================
  async analyzeSkillGaps(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const { targetRole, targetJobIds } = req.body;

      const candidate = await Candidate.findOne({ where: { user_id: userId } });
      if (!candidate) return res.status(404).json({ message: 'Candidate profile not found' });

      // Get candidate's matrix for current skills
      const matrix = await CandidateMatrix.findOne({
        where: { candidate_id: candidate.id },
        order: [['generated_at', 'DESC']],
      });

      const skills = matrix?.skills || [];
      const experience = matrix?.total_years_experience || 0;

      // Optionally get target job descriptions
      let jobDescriptions: string[] | undefined;
      if (targetJobIds?.length) {
        const jobs = await Job.findAll({ where: { id: targetJobIds } });
        jobDescriptions = jobs.map(
          (j) => `${j.title}: ${j.description?.substring(0, 1000)}`
        );
      }

      const result = await qwenService.analyzeSkillGaps(
        skills,
        experience,
        targetRole,
        jobDescriptions
      );

      return res.json(result);
    } catch (error: any) {
      console.error('[AI] Skill gap analysis failed:', error.message);
      return res.status(500).json({ message: error.message || 'Skill gap analysis failed' });
    }
  }

  // ============================================================
  //  6.9  Salary Estimator (Any role)
  // ============================================================
  async estimateSalary(req: AuthRequest, res: Response) {
    try {
      const { role, skills, yearsExperience, country, city } = req.body;

      if (!role || !country) {
        return res.status(400).json({ message: 'role and country are required' });
      }

      const result = await qwenService.estimateSalary(
        role,
        skills || [],
        yearsExperience || 0,
        country,
        city
      );

      return res.json(result);
    } catch (error: any) {
      console.error('[AI] Salary estimation failed:', error.message);
      return res.status(500).json({ message: error.message || 'Salary estimation failed' });
    }
  }

  // ============================================================
  //  6.10  AI Chat Assistant (Any role)
  // ============================================================
  async chat(req: AuthRequest, res: Response) {
    try {
      const { message, conversationHistory } = req.body;

      if (!message) return res.status(400).json({ message: 'message is required' });

      const context = req.user
        ? {
            userRole: req.user.role,
            userName: req.user.name || req.user.username,
          }
        : undefined;

      const result = await qwenService.chatAssistant(
        message,
        conversationHistory || [],
        context
      );

      return res.json(result);
    } catch (error: any) {
      console.error('[AI] Chat failed:', error.message);
      return res.status(500).json({ message: error.message || 'AI chat failed' });
    }
  }
}

export const aiController = new AiController();
