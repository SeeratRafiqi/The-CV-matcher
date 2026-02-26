import { Request, Response } from 'express';
import { Op } from 'sequelize';
import {
  Job,
  JobMatrix,
  CompanyProfile,
  Application,
  Match,
  SavedJob,
  CoverLetter,
  JobReport,
  Conversation,
  Message,
} from '../db/models/index.js';
import { BaseController } from '../db/base/BaseController.js';
import { qwenService } from '../services/qwen.js';
import { fetchAndExtractText } from '../utils/htmlParser.js';
import { pdfParserService } from '../services/pdfParser.js';
import { randomUUID } from 'crypto';
import type { AuthRequest } from '../middleware/auth.js';

export class JobController extends BaseController {
  protected model = Job;

  async list(req: Request, res: Response) {
    await this.handleRequest(req, res, async () => {
      const { status, locationType, country } = req.query;

      const where: any = {};
      if (status) where.status = status;
      if (locationType) where.location_type = locationType;
      if (country) where.country = country;

      const jobs = await Job.findAll({
        where,
        include: [{ model: JobMatrix, as: 'matrix', required: false }],
        order: [['created_at', 'DESC']],
      });

      return jobs.map((j: any) => ({
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
          status: j.status,
          createdAt: j.created_at,
          matrix: j.matrix
            ? {
                id: j.matrix.id,
                jobId: j.matrix.job_id,
                requiredSkills: j.matrix.required_skills,
                preferredSkills: j.matrix.preferred_skills,
                experienceWeight: j.matrix.experience_weight,
                locationWeight: j.matrix.location_weight,
                domainWeight: j.matrix.domain_weight,
                generatedAt: j.matrix.generated_at,
              }
            : undefined,
      }));
    });
  }

  async get(req: Request, res: Response) {
    await this.handleRequest(req, res, async () => {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        throw new Error('Job ID is required');
      }

      const job = await Job.findByPk(id, {
        include: [{ model: JobMatrix, as: 'matrix', required: false }],
      });

      if (!job) {
        const error: any = new Error('Job not found');
        error.status = 404;
        throw error;
      }

      const j: any = job;
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
        status: j.status,
        createdAt: j.created_at,
        matrix: j.matrix
          ? {
              id: j.matrix.id,
              jobId: j.matrix.job_id,
              requiredSkills: j.matrix.required_skills,
              preferredSkills: j.matrix.preferred_skills,
              experienceWeight: j.matrix.experience_weight,
              locationWeight: j.matrix.location_weight,
              domainWeight: j.matrix.domain_weight,
              generatedAt: j.matrix.generated_at,
            }
          : undefined,
      };
    });
  }

  async create(req: Request, res: Response) {
    await this.handleRequest(req, res, async () => {
      const {
        title,
        department,
        company,
        locationType,
        country,
        city,
        description,
        mustHaveSkills,
        niceToHaveSkills,
        minYearsExperience,
        seniorityLevel,
        status,
      } = req.body;

      const job = await Job.create({
        id: randomUUID(),
        title,
        department,
        company,
        location_type: locationType,
        country,
        city,
        description,
        must_have_skills: mustHaveSkills || [],
        nice_to_have_skills: niceToHaveSkills || [],
        min_years_experience: minYearsExperience,
        seniority_level: seniorityLevel,
        status: status || 'draft',
      });

      // Generate matrix if published
      if (job.status === 'published') {
        await this.generateMatrixAsync(job.id);
      }

      // Return created job
      const createdJob = await Job.findByPk(job.id, {
        include: [{ model: JobMatrix, as: 'matrix', required: false }],
      });
      const j: any = createdJob;
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
        status: j.status,
        createdAt: j.created_at,
        matrix: j.matrix ? {
          id: j.matrix.id,
          jobId: j.matrix.job_id,
          requiredSkills: j.matrix.required_skills,
          preferredSkills: j.matrix.preferred_skills,
          experienceWeight: j.matrix.experience_weight,
          locationWeight: j.matrix.location_weight,
          domainWeight: j.matrix.domain_weight,
          generatedAt: j.matrix.generated_at,
        } : undefined,
      };
    });
  }

  async createFromUrl(req: Request, res: Response) {
    await this.handleRequest(req, res, async () => {
      // Debug: Check if body exists
      console.log('[JobController] Request body:', req.body);
      console.log('[JobController] Content-Type:', req.headers['content-type']);
      console.log('[JobController] Request method:', req.method);
      console.log('[JobController] Request headers:', JSON.stringify(req.headers, null, 2));
      
      // Check if body is undefined (not parsed) vs empty object (parsed but empty)
      if (req.body === undefined) {
        throw new Error('Request body is undefined. Body parser middleware may not be running. Ensure Content-Type: application/json header is set.');
      }
      
      const url = req.body?.url;
      const status = req.body?.status;

      console.log('[JobController] Extracted url:', url);
      console.log('[JobController] Extracted status:', status);

      if (!url || typeof url !== 'string') {
        throw new Error('URL is required and must be a string');
      }

      // Validate URL format
      try {
        new URL(url);
      } catch {
        throw new Error('Invalid URL format');
      }

      console.log(`[JobController] Creating job from URL: ${url}`);

      // Step 1: Fetch and extract text from URL
      const jobPostingText = await fetchAndExtractText(url);
      
      if (!jobPostingText || jobPostingText.trim().length < 100) {
        throw new Error('Could not extract sufficient text from the job posting URL');
      }

      // Step 2: Use Qwen to extract structured job information
      console.log(`[JobController] Extracting job info using Qwen...`);
      const jobInfo = await qwenService.extractJobInfoFromPosting(jobPostingText);
      
      console.log(`[JobController] Extracted job info:`, jobInfo);

      // Step 3: Create job in database
      const job = await Job.create({
        id: randomUUID(),
        title: jobInfo.title,
        department: jobInfo.department || 'General',
        company: jobInfo.company,
        location_type: jobInfo.locationType,
        country: jobInfo.countryCode,
        city: jobInfo.city,
        description: jobInfo.description,
        must_have_skills: jobInfo.mustHaveSkills,
        nice_to_have_skills: jobInfo.niceToHaveSkills,
        min_years_experience: jobInfo.minYearsExperience,
        seniority_level: jobInfo.seniorityLevel,
        status: status || 'draft',
      });

      // Step 4: Generate matrix if published
      if (job.status === 'published') {
        await this.generateMatrixAsync(job.id);
      }

      // Step 5: Return created job with matrix
      const createdJob = await Job.findByPk(job.id, {
        include: [{ model: JobMatrix, as: 'matrix', required: false }],
      });
      
      const j: any = createdJob;
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
        status: j.status,
        createdAt: j.created_at,
        matrix: j.matrix
          ? {
              id: j.matrix.id,
              jobId: j.matrix.job_id,
              requiredSkills: j.matrix.required_skills,
              preferredSkills: j.matrix.preferred_skills,
              experienceWeight: j.matrix.experience_weight,
              locationWeight: j.matrix.location_weight,
              domainWeight: j.matrix.domain_weight,
              generatedAt: j.matrix.generated_at,
            }
          : null,
      };
    });
  }

  async createFromPdf(req: Request, res: Response) {
    await this.handleRequest(req, res, async () => {
      // upload.single() stores file in req.file, not req.files
      const pdfFile = req.file as Express.Multer.File;
      const status = (req.body as any)?.status || 'draft';

      if (!pdfFile) {
        throw new Error('No PDF file uploaded');
      }
      
      if (!pdfFile.path) {
        throw new Error('PDF file path is missing');
      }

      console.log(`[JobController] Creating job from PDF: ${pdfFile.originalname}`);

      // Step 1: Extract text from PDF
      console.log(`[JobController] Extracting text from PDF...`);
      const jobPostingText = await pdfParserService.extractText(pdfFile.path);
      
      if (!jobPostingText || jobPostingText.trim().length < 100) {
        throw new Error('Could not extract sufficient text from the PDF file');
      }

      console.log(`[JobController] Extracted ${jobPostingText.length} characters from PDF`);

      // Step 2: Use Qwen to extract structured job information
      console.log(`[JobController] Extracting job info using Qwen...`);
      const jobInfo = await qwenService.extractJobInfoFromPosting(jobPostingText);
      
      console.log(`[JobController] Extracted job info:`, jobInfo);

      // Step 3: Create job in database
      const job = await Job.create({
        id: randomUUID(),
        title: jobInfo.title,
        department: jobInfo.department || 'General',
        company: jobInfo.company,
        location_type: jobInfo.locationType,
        country: jobInfo.countryCode,
        city: jobInfo.city,
        description: jobInfo.description,
        must_have_skills: jobInfo.mustHaveSkills,
        nice_to_have_skills: jobInfo.niceToHaveSkills,
        min_years_experience: jobInfo.minYearsExperience,
        seniority_level: jobInfo.seniorityLevel,
        status: status,
      });

      // Step 4: Generate matrix if published
      if (job.status === 'published') {
        await this.generateMatrixAsync(job.id);
      }

      // Step 5: Return created job with matrix
      const createdJob = await Job.findByPk(job.id, {
        include: [{ model: JobMatrix, as: 'matrix', required: false }],
      });

      if (!createdJob) {
        throw new Error('Failed to retrieve created job');
      }

      const j: any = createdJob;
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
        status: j.status,
        createdAt: j.created_at,
        matrix: j.matrix
          ? {
              id: j.matrix.id,
              jobId: j.matrix.job_id,
              requiredSkills: j.matrix.required_skills,
              preferredSkills: j.matrix.preferred_skills,
              experienceWeight: j.matrix.experience_weight,
              locationWeight: j.matrix.location_weight,
              domainWeight: j.matrix.domain_weight,
              generatedAt: j.matrix.generated_at,
            }
          : null,
      };
    });
  }

  async update(req: Request, res: Response) {
    await this.handleRequest(req, res, async () => {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        throw new Error('Job ID is required');
      }
      const updates = req.body;

      const job = await Job.findByPk(id);
      if (!job) {
        const error: any = new Error('Job not found');
        error.status = 404;
        throw error;
      }

      const updateData: any = {};
      if (updates.title) updateData.title = updates.title;
      if (updates.department) updateData.department = updates.department;
      if (updates.company !== undefined) updateData.company = updates.company;
      if (updates.locationType) updateData.location_type = updates.locationType;
      if (updates.country) updateData.country = updates.country;
      if (updates.city) updateData.city = updates.city;
      if (updates.description) updateData.description = updates.description;
      if (updates.mustHaveSkills) updateData.must_have_skills = updates.mustHaveSkills;
      if (updates.niceToHaveSkills) updateData.nice_to_have_skills = updates.niceToHaveSkills;
      if (updates.minYearsExperience) updateData.min_years_experience = updates.minYearsExperience;
      if (updates.seniorityLevel) updateData.seniority_level = updates.seniorityLevel;
      if (updates.status) updateData.status = updates.status;

      await job.update(updateData);

      // Generate matrix if publishing
      if (updates.status === 'published' && !job.status) {
        await this.generateMatrixAsync(job.id);
      }

      // Return updated job
      const updatedJob = await Job.findByPk(id, {
        include: [{ model: JobMatrix, as: 'matrix', required: false }],
      });
      const j: any = updatedJob;
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
        status: j.status,
        createdAt: j.created_at,
        matrix: j.matrix ? {
          id: j.matrix.id,
          jobId: j.matrix.job_id,
          requiredSkills: j.matrix.required_skills,
          preferredSkills: j.matrix.preferred_skills,
          experienceWeight: j.matrix.experience_weight,
          locationWeight: j.matrix.location_weight,
          domainWeight: j.matrix.domain_weight,
          generatedAt: j.matrix.generated_at,
        } : undefined,
      };
    });
  }

  async delete(req: Request, res: Response) {
    await this.handleRequest(req, res, async () => {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        throw new Error('Job ID is required');
      }

      const job = await Job.findByPk(id);
      if (!job) {
        const error: any = new Error('Job not found');
        error.status = 404;
        throw error;
      }

      await job.destroy();
      return { message: 'Job deleted successfully' };
    });
  }

  async getMatrix(req: Request, res: Response) {
    await this.handleRequest(req, res, async () => {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        throw new Error('Job ID is required');
      }

      const matrix = await JobMatrix.findOne({ where: { job_id: id } });
      if (!matrix) {
        const error: any = new Error('Job matrix not found');
        error.status = 404;
        throw error;
      }

      return {
        id: matrix.id,
        jobId: matrix.job_id,
        requiredSkills: matrix.required_skills,
        preferredSkills: matrix.preferred_skills,
        experienceWeight: matrix.experience_weight,
        locationWeight: matrix.location_weight,
        domainWeight: matrix.domain_weight,
        generatedAt: matrix.generated_at,
      };
    });
  }

  async updateMatrix(req: Request, res: Response) {
    await this.handleRequest(req, res, async () => {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        throw new Error('Job ID is required');
      }

      const matrix = await JobMatrix.findOne({ where: { job_id: id } });
      if (!matrix) {
        const error: any = new Error('Job matrix not found');
        error.status = 404;
        throw error;
      }

      const { requiredSkills, preferredSkills, experienceWeight, locationWeight, domainWeight } = req.body;

      await matrix.update({
        required_skills: requiredSkills ?? matrix.required_skills,
        preferred_skills: preferredSkills ?? matrix.preferred_skills,
        experience_weight: experienceWeight ?? matrix.experience_weight,
        location_weight: locationWeight ?? matrix.location_weight,
        domain_weight: domainWeight ?? matrix.domain_weight,
      });

      return {
        id: matrix.id,
        jobId: matrix.job_id,
        requiredSkills: matrix.required_skills,
        preferredSkills: matrix.preferred_skills,
        experienceWeight: matrix.experience_weight,
        locationWeight: matrix.location_weight,
        domainWeight: matrix.domain_weight,
        generatedAt: matrix.generated_at,
      };
    });
  }

  async generateMatrix(req: Request, res: Response) {
    await this.handleRequest(req, res, async () => {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        throw new Error('Job ID is required');
      }

      const job = await Job.findByPk(id);
      if (!job) {
        const error: any = new Error('Job not found');
        error.status = 404;
        throw error;
      }

      // Generate in background
      this.generateMatrixAsync(id as string).catch(console.error);

      return { message: 'Matrix generation started', jobId: id };
    });
  }

  // ==================== COMPANY JOB MANAGEMENT ====================

  async listMyJobs(req: AuthRequest, res: Response) {
    await this.handleRequest(req, res, async () => {
      if (!req.user) {
        const error: any = new Error('Authentication required');
        error.status = 401;
        throw error;
      }

      const company = await CompanyProfile.findOne({ where: { user_id: req.user.id } });
      if (!company) {
        return [];
      }

      const { status } = req.query;
      const where: any = { company_id: company.id };
      if (status && status !== 'all') where.status = status;

      const jobs = await Job.findAll({
        where,
        include: [{ model: JobMatrix, as: 'matrix', required: false }],
        order: [['created_at', 'DESC']],
      });

      // Get application counts for each job
      const jobIds = jobs.map((j: any) => j.id);
      const appCounts: Record<string, number> = {};
      if (jobIds.length > 0) {
        const counts = await Application.findAll({
          where: { job_id: { [Op.in]: jobIds }, status: { [Op.ne]: 'withdrawn' } },
          attributes: ['job_id', [Job.sequelize!.fn('COUNT', Job.sequelize!.col('id')), 'count']],
          group: ['job_id'],
          raw: true,
        }) as any[];
        for (const c of counts) {
          appCounts[c.job_id] = parseInt(c.count, 10);
        }
      }

      return jobs.map((j: any) => ({
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
        status: j.status,
        deadline: j.deadline,
        isFeatured: j.is_featured,
        createdAt: j.created_at,
        applicationCount: appCounts[j.id] || 0,
        hasMatrix: !!j.matrix,
      }));
    });
  }

  async createCompanyJob(req: AuthRequest, res: Response) {
    await this.handleRequest(req, res, async () => {
      if (!req.user) {
        const error: any = new Error('Authentication required');
        error.status = 401;
        throw error;
      }

      const company = await CompanyProfile.findOne({ where: { user_id: req.user.id } });
      if (!company) {
        const error: any = new Error('Company profile not found. Please complete your profile first.');
        error.status = 404;
        throw error;
      }

      const {
        title,
        department,
        locationType,
        country,
        city,
        description,
        mustHaveSkills,
        niceToHaveSkills,
        minYearsExperience,
        seniorityLevel,
        deadline,
        status,
      } = req.body;

      if (!title || !description) {
        const error: any = new Error('Title and description are required');
        error.status = 400;
        throw error;
      }

      const job = await Job.create({
        id: randomUUID(),
        title,
        department: department || 'General',
        company: company.company_name,
        company_id: company.id,
        location_type: locationType || 'onsite',
        country: country || '',
        city: city || '',
        description,
        must_have_skills: mustHaveSkills || [],
        nice_to_have_skills: niceToHaveSkills || [],
        min_years_experience: minYearsExperience || 0,
        seniority_level: seniorityLevel || 'mid',
        deadline: deadline || null,
        status: status || 'draft',
      });

      // Generate matrix if published
      if (job.status === 'published') {
        this.generateMatrixAsync(job.id).catch(console.error);
      }

      const createdJob = await Job.findByPk(job.id, {
        include: [{ model: JobMatrix, as: 'matrix', required: false }],
      });
      const j: any = createdJob;
      return {
        id: j.id,
        title: j.title,
        department: j.department,
        company: j.company,
        companyId: j.company_id,
        locationType: j.location_type,
        country: j.country,
        city: j.city,
        description: j.description,
        mustHaveSkills: j.must_have_skills,
        niceToHaveSkills: j.nice_to_have_skills,
        minYearsExperience: j.min_years_experience,
        seniorityLevel: j.seniority_level,
        status: j.status,
        deadline: j.deadline,
        isFeatured: j.is_featured,
        createdAt: j.created_at,
      };
    });
  }

  // ==================== COMPANY: Create job from URL ====================
  async createCompanyJobFromUrl(req: AuthRequest, res: Response) {
    await this.handleRequest(req, res, async () => {
      if (!req.user) {
        const error: any = new Error('Authentication required');
        error.status = 401;
        throw error;
      }

      const company = await CompanyProfile.findOne({ where: { user_id: req.user.id } });
      if (!company) {
        const error: any = new Error('Company profile not found. Please complete your profile first.');
        error.status = 404;
        throw error;
      }

      const url = req.body?.url;
      const status = req.body?.status || 'draft';

      if (!url || typeof url !== 'string') {
        const error: any = new Error('URL is required');
        error.status = 400;
        throw error;
      }

      // Validate URL format
      try {
        new URL(url);
      } catch {
        const error: any = new Error('Invalid URL format');
        error.status = 400;
        throw error;
      }

      console.log(`[JobController] Company "${company.company_name}" creating job from URL: ${url}`);

      // Step 1: Fetch and extract text from URL
      const jobPostingText = await fetchAndExtractText(url);

      if (!jobPostingText || jobPostingText.trim().length < 100) {
        const error: any = new Error('Could not extract sufficient text from the job posting URL');
        error.status = 422;
        throw error;
      }

      // Step 2: Use Qwen to extract structured job information
      console.log(`[JobController] Extracting job info using Qwen...`);
      const jobInfo = await qwenService.extractJobInfoFromPosting(jobPostingText);

      console.log(`[JobController] Extracted job info:`, jobInfo);

      // Step 3: Create job linked to company
      const job = await Job.create({
        id: randomUUID(),
        title: jobInfo.title,
        department: jobInfo.department || 'General',
        company: company.company_name,
        company_id: company.id,
        location_type: jobInfo.locationType || 'onsite',
        country: jobInfo.countryCode || '',
        city: jobInfo.city || '',
        description: jobInfo.description,
        must_have_skills: jobInfo.mustHaveSkills || [],
        nice_to_have_skills: jobInfo.niceToHaveSkills || [],
        min_years_experience: jobInfo.minYearsExperience || 0,
        seniority_level: jobInfo.seniorityLevel || 'mid',
        status: status,
      });

      // Step 4: Generate matrix if published
      if (job.status === 'published') {
        this.generateMatrixAsync(job.id).catch(console.error);
      }

      // Step 5: Return created job
      const createdJob = await Job.findByPk(job.id, {
        include: [{ model: JobMatrix, as: 'matrix', required: false }],
      });
      const j: any = createdJob;
      return {
        id: j.id,
        title: j.title,
        department: j.department,
        company: j.company,
        companyId: j.company_id,
        locationType: j.location_type,
        country: j.country,
        city: j.city,
        description: j.description,
        mustHaveSkills: j.must_have_skills,
        niceToHaveSkills: j.nice_to_have_skills,
        minYearsExperience: j.min_years_experience,
        seniorityLevel: j.seniority_level,
        status: j.status,
        createdAt: j.created_at,
        hasMatrix: !!j.matrix,
      };
    });
  }

  async updateCompanyJob(req: AuthRequest, res: Response) {
    await this.handleRequest(req, res, async () => {
      if (!req.user) {
        const error: any = new Error('Authentication required');
        error.status = 401;
        throw error;
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        const error: any = new Error('Job ID is required');
        error.status = 400;
        throw error;
      }
      const company = await CompanyProfile.findOne({ where: { user_id: req.user.id } });
      if (!company) {
        const error: any = new Error('Company profile not found');
        error.status = 404;
        throw error;
      }

      const job = await Job.findByPk(id);
      if (!job) {
        const error: any = new Error('Job not found');
        error.status = 404;
        throw error;
      }

      if (job.company_id !== company.id) {
        const error: any = new Error('Access denied: this job does not belong to your company');
        error.status = 403;
        throw error;
      }

      const updates = req.body;
      const updateData: any = {};
      if (updates.title !== undefined) updateData.title = updates.title;
      if (updates.department !== undefined) updateData.department = updates.department;
      if (updates.locationType !== undefined) updateData.location_type = updates.locationType;
      if (updates.country !== undefined) updateData.country = updates.country;
      if (updates.city !== undefined) updateData.city = updates.city;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.mustHaveSkills !== undefined) updateData.must_have_skills = updates.mustHaveSkills;
      if (updates.niceToHaveSkills !== undefined) updateData.nice_to_have_skills = updates.niceToHaveSkills;
      if (updates.minYearsExperience !== undefined) updateData.min_years_experience = updates.minYearsExperience;
      if (updates.seniorityLevel !== undefined) updateData.seniority_level = updates.seniorityLevel;
      if (updates.deadline !== undefined) updateData.deadline = updates.deadline;
      if (updates.status !== undefined) updateData.status = updates.status;

      const wasNotPublished = job.status !== 'published';
      await job.update(updateData);

      // Generate matrix if publishing for the first time
      if (updates.status === 'published' && wasNotPublished) {
        this.generateMatrixAsync(job.id).catch(console.error);
      }

      const updatedJob = await Job.findByPk(id, {
        include: [{ model: JobMatrix, as: 'matrix', required: false }],
      });
      const j: any = updatedJob;
      return {
        id: j.id,
        title: j.title,
        department: j.department,
        company: j.company,
        companyId: j.company_id,
        locationType: j.location_type,
        country: j.country,
        city: j.city,
        description: j.description,
        mustHaveSkills: j.must_have_skills,
        niceToHaveSkills: j.nice_to_have_skills,
        minYearsExperience: j.min_years_experience,
        seniorityLevel: j.seniority_level,
        status: j.status,
        deadline: j.deadline,
        isFeatured: j.is_featured,
        createdAt: j.created_at,
        hasMatrix: !!j.matrix,
      };
    });
  }

  async deleteCompanyJob(req: AuthRequest, res: Response) {
    await this.handleRequest(req, res, async () => {
      if (!req.user) {
        const error: any = new Error('Authentication required');
        error.status = 401;
        throw error;
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        const error: any = new Error('Job ID is required');
        error.status = 400;
        throw error;
      }
      const company = await CompanyProfile.findOne({ where: { user_id: req.user.id } });
      if (!company) {
        const error: any = new Error('Company profile not found');
        error.status = 404;
        throw error;
      }

      const job = await Job.findByPk(id);
      if (!job) {
        const error: any = new Error('Job not found');
        error.status = 404;
        throw error;
      }

      if (job.company_id !== company.id) {
        const error: any = new Error('Access denied: this job does not belong to your company');
        error.status = 403;
        throw error;
      }

      // Keep data integrity: do not allow hard delete once applications exist.
      const applicationCount = await Application.count({ where: { job_id: job.id } });
      if (applicationCount > 0) {
        const error: any = new Error(
          'This job already has applications and cannot be deleted. Please close the job instead.'
        );
        error.status = 400;
        throw error;
      }

      const tx = await Job.sequelize!.transaction();
      try {
        // Clean dependent data that can still exist even without applications
        await Match.destroy({ where: { job_id: job.id }, transaction: tx });
        await JobMatrix.destroy({ where: { job_id: job.id }, transaction: tx });
        await JobReport.destroy({ where: { job_id: job.id }, transaction: tx });
        await SavedJob.destroy({ where: { job_id: job.id }, transaction: tx });
        await CoverLetter.destroy({ where: { job_id: job.id }, transaction: tx });

        const conversations = await Conversation.findAll({
          where: { job_id: job.id },
          attributes: ['id'],
          transaction: tx,
        });
        const conversationIds = conversations.map((c: any) => c.id);
        if (conversationIds.length > 0) {
          await Message.destroy({ where: { conversation_id: { [Op.in]: conversationIds } }, transaction: tx });
        }
        await Conversation.destroy({ where: { job_id: job.id }, transaction: tx });

        await job.destroy({ transaction: tx });
        await tx.commit();
      } catch (err) {
        await tx.rollback();
        throw err;
      }

      return { message: 'Job deleted successfully' };
    });
  }

  async getCompanyJob(req: AuthRequest, res: Response) {
    await this.handleRequest(req, res, async () => {
      if (!req.user) {
        const error: any = new Error('Authentication required');
        error.status = 401;
        throw error;
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id) {
        const error: any = new Error('Job ID is required');
        error.status = 400;
        throw error;
      }
      const company = await CompanyProfile.findOne({ where: { user_id: req.user.id } });
      if (!company) {
        const error: any = new Error('Company profile not found');
        error.status = 404;
        throw error;
      }

      const job = await Job.findByPk(id, {
        include: [{ model: JobMatrix, as: 'matrix', required: false }],
      });

      if (!job) {
        const error: any = new Error('Job not found');
        error.status = 404;
        throw error;
      }

      if (job.company_id !== company.id) {
        const error: any = new Error('Access denied');
        error.status = 403;
        throw error;
      }

      // Get application counts grouped by status
      const appCounts = await Application.findAll({
        where: { job_id: id, status: { [Op.ne]: 'withdrawn' } },
        attributes: ['status', [Job.sequelize!.fn('COUNT', Job.sequelize!.col('id')), 'count']],
        group: ['status'],
        raw: true,
      }) as any[];

      const statusCounts: Record<string, number> = {};
      let totalApplications = 0;
      for (const c of appCounts) {
        statusCounts[c.status] = parseInt(c.count, 10);
        totalApplications += parseInt(c.count, 10);
      }

      const j: any = job;
      return {
        id: j.id,
        title: j.title,
        department: j.department,
        company: j.company,
        companyId: j.company_id,
        locationType: j.location_type,
        country: j.country,
        city: j.city,
        description: j.description,
        mustHaveSkills: j.must_have_skills,
        niceToHaveSkills: j.nice_to_have_skills,
        minYearsExperience: j.min_years_experience,
        seniorityLevel: j.seniority_level,
        status: j.status,
        deadline: j.deadline,
        isFeatured: j.is_featured,
        createdAt: j.created_at,
        hasMatrix: !!j.matrix,
        totalApplications,
        statusCounts,
        matrix: j.matrix ? {
          id: j.matrix.id,
          jobId: j.matrix.job_id,
          requiredSkills: j.matrix.required_skills,
          preferredSkills: j.matrix.preferred_skills,
          experienceWeight: j.matrix.experience_weight,
          locationWeight: j.matrix.location_weight,
          domainWeight: j.matrix.domain_weight,
          generatedAt: j.matrix.generated_at,
        } : undefined,
      };
    });
  }

  private async generateMatrixAsync(jobId: string) {
    try {
      const job = await Job.findByPk(jobId);
      if (!job) return;

      let matrixData: any = null;
      try {
        matrixData = await qwenService.generateJobMatrix(
          job.title,
          job.description,
          job.must_have_skills || [],
          job.nice_to_have_skills || []
        );
      } catch (error: any) {
        // Keep the publish flow resilient: if AI matrix generation fails,
        // still create a usable deterministic matrix so matching can run.
        console.warn('[JobController] AI matrix generation failed, using fallback matrix:', error?.message || error);
      }

      const requiredSkills = Array.isArray(matrixData?.requiredSkills)
        ? matrixData.requiredSkills
        : (job.must_have_skills || []).map((skill: string) => ({ skill, weight: 85 }));
      const preferredSkills = Array.isArray(matrixData?.preferredSkills)
        ? matrixData.preferredSkills
        : (job.nice_to_have_skills || []).map((skill: string) => ({ skill, weight: 60 }));
      const experienceWeight = Number.isFinite(matrixData?.experienceWeight) ? matrixData.experienceWeight : 20;
      const locationWeight = Number.isFinite(matrixData?.locationWeight) ? matrixData.locationWeight : 15;
      const domainWeight = Number.isFinite(matrixData?.domainWeight) ? matrixData.domainWeight : 10;

      // Delete existing matrix if any
      await JobMatrix.destroy({ where: { job_id: jobId } });

      // Create new matrix
      await JobMatrix.create({
        id: randomUUID(),
        job_id: jobId,
        required_skills: requiredSkills,
        preferred_skills: preferredSkills,
        experience_weight: experienceWeight,
        location_weight: locationWeight,
        domain_weight: domainWeight,
        qwen_model_version: qwenService.getModelVersion(),
      });

      // Trigger automatic match calculation for all matrix_ready candidates
      await this.triggerMatchCalculationForAllCandidates(jobId);
    } catch (error: any) {
      console.error('Job matrix generation failed:', error);
    }
  }

  private async triggerMatchCalculationForAllCandidates(jobId: string) {
    try {
      // Import here to avoid circular dependency
      const { Candidate, CandidateMatrix } = await import('../db/models/index.js');
      const { matchController } = await import('./matchController.js');
      
      // Get all candidates with matrix_ready status
      const candidates = await Candidate.findAll({
        include: [
          {
            model: CandidateMatrix,
            as: 'matrices',
            required: true,
          },
        ],
      });

      // Calculate matches for each candidate
      for (const candidate of candidates) {
        await matchController.calculateMatchForCandidateAndJob(candidate.id, jobId);
      }
    } catch (error: any) {
      console.error('Failed to trigger match calculation:', error);
    }
  }
}

export const jobController = new JobController();
