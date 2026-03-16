import { Request, Response } from 'express';
import { Op } from 'sequelize';
import {
  Application,
  ApplicationHistory,
  Candidate,
  Job,
  JobMatrix,
  Match,
  CompanyProfile,
  CandidateMatrix,
  PipelineStage,
} from '../db/models/index.js';
import { CvFile } from '../db/models/CvFile.js';
import { BaseController } from '../db/base/BaseController.js';
import type { AuthRequest } from '../middleware/auth.js';
import { randomUUID } from 'crypto';
import { notificationService } from '../services/notificationService.js';
import { pdfParserService } from '../services/pdfParser.js';

async function getCvTextForCandidate(candidateId: string): Promise<string> {
  const cvFile = await CvFile.findOne({
    where: { candidate_id: candidateId },
    order: [['uploaded_at', 'DESC']],
  });
  if (!cvFile?.file_path) throw new Error('No CV found for this candidate.');
  return pdfParserService.extractText(cvFile.file_path);
}

export class ApplicationController extends BaseController {
  protected model = Application;

  // ==================== CANDIDATE: Apply to a job ====================
  async apply(req: AuthRequest, res: Response) {
    await this.handleRequest(req, res, async () => {
      if (!req.user) {
        const error: any = new Error('Authentication required');
        error.status = 401;
        throw error;
      }

      const { jobId, coverLetter, cvType, tailoredCvText } = req.body;
      if (!jobId) {
        const error: any = new Error('Job ID is required');
        error.status = 400;
        throw error;
      }

      // Find candidate linked to this user
      const candidate = await Candidate.findOne({ where: { user_id: req.user.id } });
      if (!candidate) {
        const error: any = new Error('Candidate profile not found. Please complete your profile first.');
        error.status = 404;
        throw error;
      }

      // Check job exists and is published
      const job = await Job.findByPk(jobId);
      if (!job) {
        const error: any = new Error('Job not found');
        error.status = 404;
        throw error;
      }
      if (job.status !== 'published') {
        const error: any = new Error('This job is not currently accepting applications');
        error.status = 400;
        throw error;
      }

      // Check deadline
      if (job.deadline && new Date(job.deadline) < new Date()) {
        const error: any = new Error('The application deadline for this job has passed');
        error.status = 400;
        throw error;
      }

      // Resolve which CV to attach: tailored or original
      const useTailored = cvType === 'tailored' && typeof tailoredCvText === 'string' && tailoredCvText.trim().length > 0;
      let submittedCvText: string;
      const resolvedCvType = useTailored ? 'tailored' : 'original';
      if (useTailored) {
        submittedCvText = tailoredCvText.trim();
      } else {
        try {
          submittedCvText = await getCvTextForCandidate(candidate.id);
        } catch {
          const err: any = new Error('Please upload a CV from your Dashboard or Profile before applying.');
          err.status = 400;
          throw err;
        }
      }
      if (!submittedCvText || !submittedCvText.trim()) {
        const err: any = new Error('Please upload a CV before applying.');
        err.status = 400;
        throw err;
      }

      // Check if already applied
      const existingApp = await Application.findOne({
        where: { candidate_id: candidate.id, job_id: jobId },
      });
      if (existingApp) {
        if (existingApp.status === 'withdrawn') {
          // Allow re-application
          await existingApp.update({
            status: 'applied',
            cover_letter: coverLetter || existingApp.cover_letter,
            cv_type: resolvedCvType,
            submitted_cv_text: submittedCvText || null,
            applied_at: new Date(),
            updated_at: new Date(),
          });
          return this.formatApplication(existingApp, job);
        }
        const error: any = new Error('You have already applied to this job');
        error.status = 409;
        throw error;
      }

      // Find existing match
      const existingMatch = await Match.findOne({
        where: { candidate_id: candidate.id, job_id: jobId },
      });

      // Find the "Applied" pipeline stage for this company
      let pipelineStageId: string | null = null;
      if (job.company_id) {
        const appliedStage = await PipelineStage.findOne({
          where: {
            company_id: job.company_id,
            name: 'Applied',
          },
        });
        pipelineStageId = appliedStage?.id || null;
      }

      const application = await Application.create({
        id: randomUUID(),
        candidate_id: candidate.id,
        job_id: jobId,
        status: 'applied',
        cover_letter: coverLetter || null,
        cv_type: resolvedCvType,
        submitted_cv_text: submittedCvText || null,
        match_id: existingMatch?.id || null,
        pipeline_stage_id: pipelineStageId,
      });

      // If no match exists, trigger calculation in background
      if (!existingMatch) {
        this.triggerMatchCalculation(candidate.id, jobId, application.id).catch(console.error);
      } else {
        // Link match to application
        await existingMatch.update({ application_id: application.id });
      }

      // Notify company about the new application
      notificationService.notifyApplicationReceived(
        application.id,
        jobId,
        candidate.id
      ).catch(console.error);

      return this.formatApplication(application, job);
    });
  }

  // ==================== CANDIDATE: Get my applications ====================
  async getMyApplications(req: AuthRequest, res: Response) {
    await this.handleRequest(req, res, async () => {
      if (!req.user) {
        const error: any = new Error('Authentication required');
        error.status = 401;
        throw error;
      }

      const candidate = await Candidate.findOne({ where: { user_id: req.user.id } });
      if (!candidate) {
        return [];
      }

      const { status } = req.query;
      const where: any = { candidate_id: candidate.id };
      if (status && status !== 'all') {
        where.status = status;
      }

      const applications = await Application.findAll({
        where,
        include: [
          {
            model: Job,
            as: 'job',
            include: [
              { model: CompanyProfile, as: 'companyProfile', attributes: ['id', 'company_name', 'logo_url'] },
            ],
          },
          { model: Match, as: 'match' },
        ],
        order: [['applied_at', 'DESC']],
      });

      return applications.map((app: any) => ({
        id: app.id,
        candidateId: app.candidate_id,
        jobId: app.job_id,
        status: app.status,
        coverLetter: app.cover_letter,
        cvType: app.cv_type || 'original',
        submittedCvText: app.submitted_cv_text || null,
        appliedAt: app.applied_at,
        updatedAt: app.updated_at,
        matchScore: app.match?.score || null,
        matchBreakdown: app.match?.breakdown || null,
        job: app.job ? {
          id: app.job.id,
          title: app.job.title,
          department: app.job.department,
          company: app.job.company,
          locationType: app.job.location_type,
          country: app.job.country,
          city: app.job.city,
          seniorityLevel: app.job.seniority_level,
          status: app.job.status,
          createdAt: app.job.created_at,
          companyProfile: app.job.companyProfile ? {
            id: app.job.companyProfile.id,
            companyName: app.job.companyProfile.company_name,
            logoUrl: app.job.companyProfile.logo_url,
          } : null,
        } : null,
      }));
    });
  }

  // ==================== CANDIDATE: Withdraw application ====================
  async withdraw(req: AuthRequest, res: Response) {
    await this.handleRequest(req, res, async () => {
      if (!req.user) {
        const error: any = new Error('Authentication required');
        error.status = 401;
        throw error;
      }

      const { id } = req.params;
      const candidate = await Candidate.findOne({ where: { user_id: req.user.id } });
      if (!candidate) {
        const error: any = new Error('Candidate profile not found');
        error.status = 404;
        throw error;
      }

      const application = await Application.findOne({
        where: { id, candidate_id: candidate.id },
      });
      if (!application) {
        const error: any = new Error('Application not found');
        error.status = 404;
        throw error;
      }

      if (application.status !== 'applied') {
        const error: any = new Error('Can only withdraw applications that are in "applied" status');
        error.status = 400;
        throw error;
      }

      await application.update({ status: 'withdrawn', updated_at: new Date() });
      return { message: 'Application withdrawn successfully' };
    });
  }

  // ==================== COMPANY: Get applications for a job ====================
  async getForJob(req: AuthRequest, res: Response) {
    await this.handleRequest(req, res, async () => {
      if (!req.user) {
        const error: any = new Error('Authentication required');
        error.status = 401;
        throw error;
      }

      const { jobId } = req.params;

      // Verify job belongs to this company
      const company = await CompanyProfile.findOne({ where: { user_id: req.user.id } });
      if (!company) {
        const error: any = new Error('Company profile not found');
        error.status = 404;
        throw error;
      }

      const job = await Job.findByPk(jobId);
      if (!job) {
        const error: any = new Error('Job not found');
        error.status = 404;
        throw error;
      }

      // Allow company that owns the job OR admin
      if (job.company_id !== company.id && req.user.role !== 'admin') {
        const error: any = new Error('Access denied: this job does not belong to your company');
        error.status = 403;
        throw error;
      }

      const { status, sortBy } = req.query;
      const where: any = { job_id: jobId };
      if (status && status !== 'all') {
        where.status = status;
      }
      // Exclude withdrawn
      where.status = where.status || { [Op.ne]: 'withdrawn' };

      const order: any[] = [];
      if (sortBy === 'score') {
        // Will sort after fetching since score is on match
      } else if (sortBy === 'date') {
        order.push(['applied_at', 'DESC']);
      } else {
        order.push(['applied_at', 'DESC']);
      }

      const applications = await Application.findAll({
        where,
        include: [
          {
            model: Candidate,
            as: 'candidate',
            attributes: ['id', 'name', 'email', 'phone', 'country', 'headline', 'photo_url'],
          },
          { model: Match, as: 'match' },
        ],
        order,
      });

      let result = applications.map((app: any) => ({
        id: app.id,
        candidateId: app.candidate_id,
        jobId: app.job_id,
        status: app.status,
        coverLetter: app.cover_letter,
        appliedAt: app.applied_at,
        updatedAt: app.updated_at,
        matchScore: app.match?.score || null,
        matchBreakdown: app.match?.breakdown || null,
        matchExplanation: app.match?.explanation || null,
        matchGaps: app.match?.gaps || null,
        candidate: app.candidate ? {
          id: app.candidate.id,
          name: app.candidate.name,
          email: app.candidate.email,
          phone: app.candidate.phone,
          country: app.candidate.country,
          headline: app.candidate.headline,
          photoUrl: app.candidate.photo_url,
        } : null,
      }));

      // Sort by score if requested
      if (sortBy === 'score') {
        result.sort((a: any, b: any) => (b.matchScore || 0) - (a.matchScore || 0));
      }

      return result;
    });
  }

  // ==================== COMPANY: Update application status ====================
  async updateStatus(req: AuthRequest, res: Response) {
    await this.handleRequest(req, res, async () => {
      if (!req.user) {
        const error: any = new Error('Authentication required');
        error.status = 401;
        throw error;
      }

      const { id } = req.params;
      const { status } = req.body;

      const validStatuses = ['screening', 'interview', 'offer', 'hired', 'rejected'];
      if (!validStatuses.includes(status)) {
        const error: any = new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
        error.status = 400;
        throw error;
      }

      const application = await Application.findByPk(id, {
        include: [{ model: Job, as: 'job' }],
      });
      if (!application) {
        const error: any = new Error('Application not found');
        error.status = 404;
        throw error;
      }

      // Verify ownership
      const job = (application as any).job;
      if (req.user.role === 'company') {
        const company = await CompanyProfile.findOne({ where: { user_id: req.user.id } });
        if (!company || job.company_id !== company.id) {
          const error: any = new Error('Access denied');
          error.status = 403;
          throw error;
        }
      }

      const oldStatus = application.status;
      await application.update({ status, updated_at: new Date() });

      // Create application history record
      await ApplicationHistory.create({
        id: randomUUID(),
        application_id: id,
        from_status: oldStatus,
        to_status: status,
        changed_by: req.user.id,
        note: req.body.note || null,
      });

      // Notify candidate about status change
      notificationService.notifyStatusChanged(
        id,
        application.candidate_id,
        application.job_id,
        status
      ).catch(console.error);

      return { message: `Application status updated to ${status}`, applicationId: id, status };
    });
  }

  // ==================== JOB BROWSING: Browse published jobs ====================
  async browseJobs(req: Request, res: Response) {
    await this.handleRequest(req, res, async () => {
      const {
        search,
        skills,
        country,
        locationType,
        seniorityLevel,
        page = '1',
        limit = '20',
        sortBy = 'newest',
      } = req.query;

      const where: any = {
        status: 'published',
      };

      // Include all published jobs (including past-deadline); UI shows "Closed" tag and blocks apply
      if (country && country !== 'all') where.country = country;
      if (locationType && locationType !== 'all') where.location_type = locationType;
      if (seniorityLevel && seniorityLevel !== 'all') where.seniority_level = seniorityLevel;

      if (search) {
        where[Op.and as any] = [
          ...(where[Op.and as any] || []),
          {
            [Op.or]: [
              { title: { [Op.like]: `%${search}%` } },
              { description: { [Op.like]: `%${search}%` } },
              { department: { [Op.like]: `%${search}%` } },
              { company: { [Op.like]: `%${search}%` } },
            ],
          },
        ];
      }

      const pageNum = parseInt(page as string, 10) || 1;
      const limitNum = Math.min(parseInt(limit as string, 10) || 20, 50);
      const offset = (pageNum - 1) * limitNum;

      const order: any[] = [];
      if (sortBy === 'newest') order.push(['created_at', 'DESC']);
      else if (sortBy === 'deadline') order.push(['deadline', 'ASC']);
      else order.push(['created_at', 'DESC']);

      const { rows: jobs, count: total } = await Job.findAndCountAll({
        where,
        include: [
          { model: CompanyProfile, as: 'companyProfile', attributes: ['id', 'company_name', 'logo_url', 'industry'] },
        ],
        order,
        limit: limitNum,
        offset,
      });

      // Get match scores if candidate is authenticated
      let matchScores: Record<string, number> = {};
      const authReq = req as AuthRequest;
      if (authReq.user?.role === 'candidate') {
        const candidate = await Candidate.findOne({ where: { user_id: authReq.user.id } });
        if (candidate) {
          const jobIds = jobs.map((j: any) => j.id);
          const matches = await Match.findAll({
            where: { candidate_id: candidate.id, job_id: { [Op.in]: jobIds } },
            attributes: ['job_id', 'score'],
          });
          for (const m of matches) {
            matchScores[m.job_id] = m.score;
          }
        }
      }

      // Check application status for authenticated candidates
      let applicationStatuses: Record<string, string> = {};
      if (authReq.user?.role === 'candidate') {
        const candidate = await Candidate.findOne({ where: { user_id: authReq.user.id } });
        if (candidate) {
          const jobIds = jobs.map((j: any) => j.id);
          const apps = await Application.findAll({
            where: { candidate_id: candidate.id, job_id: { [Op.in]: jobIds } },
            attributes: ['job_id', 'status'],
          });
          for (const a of apps) {
            applicationStatuses[a.job_id] = a.status;
          }
        }
      }

      const formattedJobs = jobs.map((j: any) => ({
        id: j.id,
        title: j.title,
        department: j.department,
        company: j.company,
        locationType: j.location_type,
        country: j.country,
        city: j.city,
        description: j.description?.substring(0, 300) + (j.description?.length > 300 ? '...' : ''),
        mustHaveSkills: j.must_have_skills,
        niceToHaveSkills: j.nice_to_have_skills,
        minYearsExperience: j.min_years_experience,
        seniorityLevel: j.seniority_level,
        deadline: j.deadline,
        isFeatured: j.is_featured,
        createdAt: j.created_at,
        companyProfile: j.companyProfile ? {
          id: j.companyProfile.id,
          companyName: j.companyProfile.company_name,
          logoUrl: j.companyProfile.logo_url,
          industry: j.companyProfile.industry,
        } : null,
        matchScore: matchScores[j.id] ?? null,
        applicationStatus: applicationStatuses[j.id] ?? null,
      }));

      // Sort by AI score if requested and candidate is authenticated
      if (sortBy === 'relevance') {
        formattedJobs.sort((a: any, b: any) => (b.matchScore || 0) - (a.matchScore || 0));
      }

      return {
        jobs: formattedJobs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      };
    });
  }

  // ==================== PUBLIC: Job detail ====================
  async getJobPublic(req: Request, res: Response) {
    await this.handleRequest(req, res, async () => {
      const { id } = req.params;

      const job = await Job.findOne({
        where: { id, status: 'published' },
        include: [
          { model: CompanyProfile, as: 'companyProfile', attributes: ['id', 'company_name', 'logo_url', 'industry', 'company_size', 'website', 'description'] },
          { model: JobMatrix, as: 'matrix', required: false },
        ],
      });

      if (!job) {
        const error: any = new Error('Job not found');
        error.status = 404;
        throw error;
      }

      const j: any = job;

      // Get match if authenticated as candidate
      let matchData = null;
      let applicationStatus = null;
      const authReq = req as AuthRequest;
      if (authReq.user?.role === 'candidate') {
        const candidate = await Candidate.findOne({ where: { user_id: authReq.user.id } });
        if (candidate) {
          const match = await Match.findOne({
            where: { candidate_id: candidate.id, job_id: id },
          });
          if (match) {
            matchData = {
              score: match.score,
              breakdown: match.breakdown,
              explanation: match.explanation,
              gaps: match.gaps,
            };
          }
          const app = await Application.findOne({
            where: { candidate_id: candidate.id, job_id: id },
          });
          if (app) {
            applicationStatus = app.status;
          }
        }
      }

      return {
        id: j.id,
        title: j.title,
        department: j.department,
        company: j.company,
        locationType: j.location_type,
        country: j.country,
        city: j.city,
        description: j.description,
        mustHaveSkills: j.must_have_skills,
        niceToHaveSkills: j.nice_to_have_skills,
        minYearsExperience: j.min_years_experience,
        seniorityLevel: j.seniority_level,
        deadline: j.deadline,
        isFeatured: j.is_featured,
        createdAt: j.created_at,
        companyProfile: j.companyProfile ? {
          id: j.companyProfile.id,
          companyName: j.companyProfile.company_name,
          logoUrl: j.companyProfile.logo_url,
          industry: j.companyProfile.industry,
          companySize: j.companyProfile.company_size,
          website: j.companyProfile.website,
          description: j.companyProfile.description,
        } : null,
        match: matchData,
        applicationStatus,
      };
    });
  }

  // ==================== COMPANY: Get application counts for dashboard ====================
  async getCompanyStats(req: AuthRequest, res: Response) {
    await this.handleRequest(req, res, async () => {
      if (!req.user) {
        const error: any = new Error('Authentication required');
        error.status = 401;
        throw error;
      }

      const company = await CompanyProfile.findOne({ where: { user_id: req.user.id } });
      if (!company) {
        return { activeJobs: 0, totalApplications: 0, shortlisted: 0, hired: 0, recentApplications: [] };
      }

      const companyJobs = await Job.findAll({
        where: { company_id: company.id },
        attributes: ['id', 'status'],
      });

      const jobIds = companyJobs.map((j: any) => j.id);
      const activeJobs = companyJobs.filter((j: any) => j.status === 'published').length;

      if (jobIds.length === 0) {
        return { activeJobs: 0, totalApplications: 0, shortlisted: 0, hired: 0, recentApplications: [] };
      }

      const totalApplications = await Application.count({
        where: { job_id: { [Op.in]: jobIds }, status: { [Op.ne]: 'withdrawn' } },
      });

      const shortlisted = await Application.count({
        where: { job_id: { [Op.in]: jobIds }, status: { [Op.in]: ['screening', 'interview'] } },
      });

      const hired = await Application.count({
        where: { job_id: { [Op.in]: jobIds }, status: 'hired' },
      });

      // Recent applications
      const recentApps = await Application.findAll({
        where: { job_id: { [Op.in]: jobIds }, status: { [Op.ne]: 'withdrawn' } },
        include: [
          { model: Candidate, as: 'candidate', attributes: ['id', 'name', 'headline', 'photo_url'] },
          { model: Job, as: 'job', attributes: ['id', 'title'] },
          { model: Match, as: 'match', attributes: ['score'] },
        ],
        order: [['applied_at', 'DESC']],
        limit: 10,
      });

      return {
        activeJobs,
        totalApplications,
        shortlisted,
        hired,
        recentApplications: recentApps.map((a: any) => ({
          id: a.id,
          status: a.status,
          appliedAt: a.applied_at,
          matchScore: a.match?.score || null,
          candidate: a.candidate ? {
            id: a.candidate.id,
            name: a.candidate.name,
            headline: a.candidate.headline,
            photoUrl: a.candidate.photo_url,
          } : null,
          job: a.job ? {
            id: a.job.id,
            title: a.job.title,
          } : null,
        })),
      };
    });
  }

  // ==================== Helpers ====================
  private formatApplication(app: any, job: any) {
    return {
      id: app.id,
      candidateId: app.candidate_id,
      jobId: app.job_id,
      status: app.status,
      coverLetter: app.cover_letter,
      cvType: app.cv_type || 'original',
      submittedCvText: app.submitted_cv_text || null,
      appliedAt: app.applied_at,
      updatedAt: app.updated_at,
      job: job ? {
        id: job.id,
        title: job.title,
        department: job.department,
        company: job.company,
      } : null,
    };
  }

  private async triggerMatchCalculation(candidateId: string, jobId: string, applicationId: string) {
    try {
      const { matchController } = await import('./matchController.js');
      await matchController.calculateMatchForCandidateAndJob(candidateId, jobId);

      // Link match to application
      const match = await Match.findOne({ where: { candidate_id: candidateId, job_id: jobId } });
      if (match) {
        await match.update({ application_id: applicationId });
        await Application.update(
          { match_id: match.id },
          { where: { id: applicationId } }
        );
      }
    } catch (error) {
      console.error('Failed to trigger match calculation for application:', error);
    }
  }
}

export const applicationController = new ApplicationController();

