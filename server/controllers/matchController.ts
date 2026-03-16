import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { Match, Candidate, Job, CandidateMatrix, JobMatrix, CompanyProfile, Application, User } from '../db/models/index.js';
import { BaseController } from '../db/base/BaseController.js';
import type { AuthRequest } from '../middleware/auth.js';
import { matchingService } from '../services/matching.js';
import { qwenService } from '../services/qwen.js';
import { randomUUID } from 'crypto';

export class MatchController extends BaseController {
  protected model = Match;

  async getForJob(req: Request, res: Response) {
    await this.handleRequest(req, res, async () => {
      const { jobId } = req.params;

      const matches = await Match.findAll({
        where: { job_id: jobId },
        include: [
          {
            model: Candidate,
            as: 'candidate',
            attributes: ['id', 'user_id', 'name', 'email', 'phone', 'country', 'country_code', 'headline', 'photo_url', 'bio', 'linkedin_url', 'github_url', 'portfolio_url'],
            include: [
              {
                model: CandidateMatrix,
                as: 'matrices',
                attributes: ['id', 'skills', 'roles', 'total_years_experience', 'domains', 'education', 'languages', 'generated_at'],
                limit: 1,
                order: [['generated_at', 'DESC']],
                required: false,
              },
            ],
          },
        ],
        order: [['score', 'DESC']],
      });

      // Filter out low-quality matches (score < 25)
      const filteredMatches = matches.filter((m: any) => {
        const score = typeof m.score === 'number' ? m.score : 0;
        return score >= 25;
      });

      return filteredMatches.map((m: any) => {
        const c = m.candidate;
        const matrix = c?.matrices?.[0];
        return {
          id: m.id,
          candidateId: m.candidate_id,
          jobId: m.job_id,
          score: m.score,
          breakdown: m.breakdown,
          explanation: m.explanation,
          gaps: m.gaps,
          status: m.status,
          calculatedAt: m.calculated_at,
          candidate: c ? {
            id: c.id,
            userId: c.user_id,
            name: c.name,
            email: c.email,
            headline: c.headline,
            photoUrl: c.photo_url,
            country: c.country,
            countryCode: c.country_code,
            bio: c.bio,
            linkedinUrl: c.linkedin_url,
            githubUrl: c.github_url,
            portfolioUrl: c.portfolio_url,
            skills: matrix?.skills || [],
            roles: matrix?.roles || [],
            totalYearsExperience: matrix?.total_years_experience || 0,
            domains: matrix?.domains || [],
            education: matrix?.education || [],
          } : null,
        };
      });
    });
  }

  /** Enriched matches for a company job: same as getForJob but adds appliedTo, bestFit, otherStrongFits per candidate. */
  async getEnrichedMatchesForCompanyJob(req: AuthRequest, res: Response) {
    await this.handleRequest(req, res, async () => {
      if (!req.user) throw Object.assign(new Error('Authentication required'), { status: 401 });

      const jobId = (req.params as any).jobId || (req.params as any).id;
      if (!jobId) throw Object.assign(new Error('Job ID required'), { status: 400 });

      const job = await Job.findByPk(jobId, { attributes: ['id', 'company_id', 'title'] });
      if (!job) throw Object.assign(new Error('Job not found'), { status: 404 });

      const company = await CompanyProfile.findOne({ where: { user_id: req.user.id } });
      if (!company || (job as any).company_id !== company.id) {
        throw Object.assign(new Error('Access denied'), { status: 403 });
      }

      const companyJobIds = (await Job.findAll({
        where: { company_id: company.id, status: 'published' },
        attributes: ['id'],
      })).map((j: any) => j.id);

      const jobMap = new Map(
        (await Job.findAll({ where: { id: { [Op.in]: companyJobIds } }, attributes: ['id', 'title'] }))
          .map((j: any) => [j.id, j])
      );

      const matches = await Match.findAll({
        where: { job_id: jobId },
        include: [
          {
            model: Candidate,
            as: 'candidate',
            attributes: ['id', 'user_id', 'name', 'email', 'phone', 'country', 'country_code', 'headline', 'photo_url', 'bio', 'linkedin_url', 'github_url', 'portfolio_url'],
            include: [
              {
                model: CandidateMatrix,
                as: 'matrices',
                attributes: ['id', 'skills', 'roles', 'total_years_experience', 'domains', 'education', 'languages', 'generated_at'],
                limit: 1,
                order: [['generated_at', 'DESC']],
                required: false,
              },
            ],
          },
        ],
        order: [['score', 'DESC']],
      });

      const filteredMatches = matches.filter((m: any) => (typeof m.score === 'number' ? m.score : 0) >= 25);
      const candidateIds = filteredMatches.map((m: any) => m.candidate_id);
      const matchedCandidateIds = new Set(candidateIds);

      // Applications for this job (for appliedTo) and for building bestFit across company jobs
      const applicationsForJob = await Application.findAll({
        where: { job_id: { [Op.in]: companyJobIds }, status: { [Op.ne]: 'withdrawn' } },
        include: [
          { model: Job, as: 'job', attributes: ['id', 'title'] },
          {
            model: Candidate,
            as: 'candidate',
            attributes: ['id', 'user_id', 'name', 'email', 'phone', 'country', 'country_code', 'headline', 'photo_url', 'bio', 'linkedin_url', 'github_url', 'portfolio_url'],
            include: [
              {
                model: CandidateMatrix,
                as: 'matrices',
                attributes: ['id', 'skills', 'roles', 'total_years_experience', 'domains', 'education', 'languages', 'generated_at'],
                limit: 1,
                order: [['generated_at', 'DESC']],
                required: false,
              },
            ],
          },
        ],
        order: [['applied_at', 'DESC']],
      });

      const appliedToByCandidate = new Map<string, { jobId: string; jobTitle: string }>();
      for (const app of applicationsForJob) {
        const cid = (app as any).candidate_id;
        if (!appliedToByCandidate.has(cid)) {
          const j = (app as any).job;
          appliedToByCandidate.set(cid, { jobId: (app as any).job_id, jobTitle: j?.title || 'Unknown' });
        }
      }

      const allCandidatesWithMatches = new Set(candidateIds);
      const allMatchesForCandidates = await Match.findAll({
        where: { candidate_id: { [Op.in]: [...matchedCandidateIds] }, job_id: { [Op.in]: companyJobIds } },
        attributes: ['candidate_id', 'job_id', 'score'],
        order: [['score', 'DESC']],
      });

      const STRONG_SCORE = 70;
      const byCandidate = new Map<string, { jobId: string; jobTitle: string; score: number }[]>();
      for (const m of allMatchesForCandidates) {
        const cid = (m as any).candidate_id;
        if (!byCandidate.has(cid)) byCandidate.set(cid, []);
        const j = jobMap.get((m as any).job_id);
        byCandidate.get(cid)!.push({
          jobId: (m as any).job_id,
          jobTitle: j?.title || 'Unknown',
          score: (m as any).score || 0,
        });
      }

      const currentJobTitle = (job as any).title || 'Unknown';

      const toEnriched = (m: any, appliedTo: { jobId: string; jobTitle: string } | null, bestFit: { jobId: string; jobTitle: string; score: number } | null, otherStrongFits: { jobId: string; jobTitle: string; score: number }[], c: any, matrix: any) => ({
        id: m.id,
        candidateId: (m as any).candidate_id,
        jobId: (m as any).job_id,
        score: (m as any).score,
        breakdown: (m as any).breakdown,
        explanation: (m as any).explanation,
        gaps: (m as any).gaps,
        status: (m as any).status,
        calculatedAt: (m as any).calculated_at,
        appliedTo,
        bestFit,
        otherStrongFits: otherStrongFits.slice(0, 5),
        candidate: c ? {
          id: c.id,
          userId: c.user_id,
          name: c.name,
          email: c.email,
          headline: c.headline,
          photoUrl: c.photo_url,
          country: c.country,
          countryCode: c.country_code,
          bio: c.bio,
          linkedinUrl: c.linkedin_url,
          githubUrl: c.github_url,
          portfolioUrl: c.portfolio_url,
          skills: matrix?.skills || [],
          roles: matrix?.roles || [],
          totalYearsExperience: matrix?.total_years_experience || 0,
          domains: matrix?.domains || [],
          education: matrix?.education || [],
        } : null,
      });

      const result: any[] = filteredMatches.map((m: any) => {
        const c = m.candidate;
        const matrix = c?.matrices?.[0];
        const candidateId = (m as any).candidate_id;
        const appliedTo = appliedToByCandidate.get(candidateId) || null;
        const allScores = byCandidate.get(candidateId) || [];
        const bestFit = allScores[0] ? { jobId: allScores[0].jobId, jobTitle: allScores[0].jobTitle, score: allScores[0].score } : null;
        const otherStrongFits = allScores.filter((s: any, i: number) => i > 0 && s.score >= STRONG_SCORE);
        return toEnriched(m, appliedTo, bestFit, otherStrongFits, c, matrix);
      });

      // Include applicants to THIS job who have no Match yet (so "Matched candidates" shows all applicants; unscored show as "Not scored")
      const applicationsToThisJob = applicationsForJob.filter((a: any) => a.job_id === jobId);
      for (const app of applicationsToThisJob) {
        const cid = (app as any).candidate_id;
        if (matchedCandidateIds.has(cid)) continue;
        matchedCandidateIds.add(cid);
        const c = (app as any).candidate;
        const matrix = c?.matrices?.[0];
        const appliedTo = { jobId: (job as any).id, jobTitle: currentJobTitle };
        result.push(toEnriched(
          { id: `app-${(app as any).id}`, candidate_id: cid, job_id: jobId, score: null, breakdown: null, explanation: null, gaps: null, status: null, calculated_at: null },
          appliedTo,
          null,
          [],
          c,
          matrix
        ));
      }

      return result;
    });
  }

  // ==================== GET all matched candidates across all company jobs ====================
  async getCompanyMatches(req: AuthRequest, res: Response) {
    await this.handleRequest(req, res, async () => {
      if (!req.user) throw Object.assign(new Error('Auth required'), { status: 401 });

      const company = await CompanyProfile.findOne({ where: { user_id: req.user.id } });
      if (!company) throw Object.assign(new Error('Company profile not found'), { status: 404 });

      // Get all published jobs for this company
      const jobs = await Job.findAll({
        where: { company_id: company.id, status: 'published' },
        attributes: ['id', 'title', 'department', 'city', 'country', 'seniority_level'],
      });

      if (jobs.length === 0) return [];

      const jobIds = jobs.map((j: any) => j.id);
      const jobMap = new Map(jobs.map((j: any) => [j.id, j]));

      // Get all matches for those jobs
      const matches = await Match.findAll({
        where: { job_id: { [Op.in]: jobIds }, score: { [Op.gte]: 25 } },
        include: [
          {
            model: Candidate,
            as: 'candidate',
            attributes: ['id', 'user_id', 'name', 'email', 'phone', 'country', 'country_code', 'headline', 'photo_url'],
            include: [
              {
                model: CandidateMatrix,
                as: 'matrices',
                attributes: ['id', 'skills', 'roles', 'total_years_experience', 'domains', 'education', 'languages', 'generated_at'],
                limit: 1,
                order: [['generated_at', 'DESC']],
                required: false,
              },
            ],
          },
        ],
        order: [['score', 'DESC']],
      });

      // Check which candidates have already applied
      const candidateIds = [...new Set(matches.map((m: any) => m.candidate_id))];
      const applications = await Application.findAll({
        where: { candidate_id: { [Op.in]: candidateIds }, job_id: { [Op.in]: jobIds } },
        attributes: ['candidate_id', 'job_id', 'status'],
      });
      const appMap = new Map<string, string>();
      for (const a of applications) {
        appMap.set(`${a.candidate_id}:${a.job_id}`, a.status);
      }

      return matches.map((m: any) => {
        const c = m.candidate;
        const matrix = c?.matrices?.[0];
        const job = jobMap.get(m.job_id);
        return {
          id: m.id,
          candidateId: m.candidate_id,
          jobId: m.job_id,
          score: m.score,
          breakdown: m.breakdown,
          explanation: m.explanation,
          status: m.status,
          calculatedAt: m.calculated_at,
          applicationStatus: appMap.get(`${m.candidate_id}:${m.job_id}`) || null,
          candidate: c ? {
            id: c.id,
            userId: c.user_id,
            name: c.name,
            email: c.email,
            headline: c.headline,
            photoUrl: c.photo_url,
            country: c.country,
            countryCode: c.country_code,
            skills: matrix?.skills?.slice(0, 8) || [],
            roles: matrix?.roles || [],
            totalYearsExperience: matrix?.total_years_experience || 0,
            domains: matrix?.domains || [],
          } : null,
          job: job ? {
            id: job.id,
            title: job.title,
            department: job.department,
            city: job.city,
            country: job.country,
          } : null,
        };
      });
    });
  }

  async getForCandidate(req: Request, res: Response) {
    await this.handleRequest(req, res, async () => {
      const { candidateId } = req.params;

      const matches = await Match.findAll({
        where: { candidate_id: candidateId },
        include: [{ model: Job, as: 'job' }],
        order: [['score', 'DESC']],
      });

      return matches.map((m: any) => ({
          id: m.id,
          candidateId: m.candidate_id,
          jobId: m.job_id,
          score: m.score,
          breakdown: m.breakdown,
          explanation: m.explanation,
          gaps: m.gaps,
          status: m.status,
          calculatedAt: m.calculated_at,
          job: m.job
            ? {
                id: m.job.id,
                title: m.job.title,
                department: m.job.department,
                company: m.job.company,
                locationType: m.job.location_type,
                country: m.job.country,
                city: m.job.city,
                description: m.job.description,
                mustHaveSkills: m.job.must_have_skills,
                niceToHaveSkills: m.job.nice_to_have_skills,
                minYearsExperience: m.job.min_years_experience,
                seniorityLevel: m.job.seniority_level,
                status: m.job.status,
                createdAt: m.job.created_at,
              }
            : undefined,
      }));
    });
  }

  async calculate(req: Request, res: Response) {
    await this.handleRequest(req, res, async () => {
      const jobId = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
      if (!jobId) {
        throw new Error('Job ID is required');
      }

      // Process in background
      this.calculateMatchesAsync(jobId).catch(console.error);

      return { message: 'Match calculation started', jobId };
    });
  }

  async calculateMatchForCandidateAndJob(candidateId: string, jobId: string) {
    try {
      const candidate = await Candidate.findByPk(candidateId, {
        include: [
          {
            model: CandidateMatrix,
            as: 'matrices',
            required: true,
          },
        ],
      });

      const job = await Job.findByPk(jobId, {
        include: [{ model: JobMatrix, as: 'matrix', required: true }],
      });

      if (!candidate || !job) {
        console.error('Candidate or job not found');
        return;
      }

      const candidateMatrix = (candidate as any).matrices?.[0];
      const jobMatrix = (job as any).matrix;

      if (!candidateMatrix || !jobMatrix) {
        console.error('Candidate or job matrix not found');
        return;
      }

      console.log(`[MatchController] Evaluating match: candidate="${candidate.name}" (${candidateId}) vs job="${job.title}" (${jobId})`);

      // ===== PRE-FILTER: Internship/Entry-level jobs — only allow intern-like candidates =====
      const jobSeniority = ((job as any).seniority_level || '').toLowerCase();
      const isInternshipOrEntryJob = jobSeniority === 'internship' || jobSeniority === 'intern' || 
        (job.title?.toLowerCase().includes('intern') && (job as any).min_years_experience === 0);
      
      if (isInternshipOrEntryJob) {
        const candidateYears = candidateMatrix.total_years_experience || 0;
        const headlineLower = (candidate.headline || '').toLowerCase();
        const candidateRoles = (candidateMatrix.roles || []).map((r: string) => r.toLowerCase());
        
        // Check if candidate looks experienced (NOT intern-like)
        const seniorKeywords = ['senior', 'lead', 'principal', 'architect', 'manager', 'staff', 'director', 'vp', 'head of'];
        const midKeywords = ['mid-level', 'mid level', 'experienced', 'software developer', 'software engineer', 'full-stack developer', 'full stack developer', 'backend developer', 'frontend developer'];
        
        const hasSeniorSignal = seniorKeywords.some(kw => headlineLower.includes(kw)) ||
          candidateRoles.some((r: string) => seniorKeywords.some(kw => r.includes(kw)));
        const hasMidSignal = midKeywords.some(kw => headlineLower.includes(kw)) ||
          candidateRoles.some((r: string) => midKeywords.some(kw => r.includes(kw)));
        
        // Block if: 3+ years experience, OR has senior/mid title signals with 2+ years
        const isExperienced = candidateYears >= 3 || (candidateYears >= 2 && (hasSeniorSignal || hasMidSignal)) || hasSeniorSignal;
        
        if (isExperienced) {
          console.log(`[MatchController] ⛔ SKIPPING experienced candidate "${candidate.name}" (${candidateYears}y, headline="${candidate.headline}") for internship job "${job.title}" — not a fit`);
          return;
        }
      }

      // ===== LLM-BASED MATCHING (Primary) =====
      // Use Qwen to semantically evaluate the match — handles GenAI ≈ LLM ≈ AI etc.
      let score: number;
      let breakdown: any;
      let explanation: string;
      let gaps: any[];

      try {
        const llmResult = await qwenService.evaluateMatch(
          candidateMatrix,
          jobMatrix,
          {
            title: job.title,
            description: job.description || '',
            department: job.department,
            seniorityLevel: (job as any).seniority_level,
            minYearsExperience: (job as any).min_years_experience,
            locationType: job.location_type,
            country: job.country,
          },
          {
            name: candidate.name,
            headline: candidate.headline,
            country: candidate.country,
            roles: candidateMatrix.roles,
          }
        );

        score = llmResult.score;
        breakdown = llmResult.breakdown;
        explanation = llmResult.explanation;
        gaps = llmResult.gaps;
        
        console.log(`[MatchController] LLM score for ${candidate.name} vs ${job.title}: ${score} (skills=${breakdown.skills}, exp=${breakdown.experience}, domain=${breakdown.domain}, loc=${breakdown.location})`);
      } catch (llmError: any) {
        // ===== DETERMINISTIC FALLBACK =====
        console.warn(`[MatchController] LLM evaluation failed, falling back to deterministic scoring: ${llmError.message}`);
        
        const deterministicResult = matchingService.calculateMatchScore(
          candidateMatrix,
          jobMatrix,
          candidate.country,
          job.country,
          job.location_type as 'onsite' | 'hybrid' | 'remote',
          (job as any).min_years_experience,
          (job as any).seniority_level as 'junior' | 'mid' | 'senior' | 'lead' | 'principal',
          candidate.headline,
          candidateMatrix.roles,
          job.title,
          job.department,
          job.description,
        );

        score = deterministicResult.score;
        breakdown = deterministicResult.breakdown;

        // Generate explanation separately
        try {
          const explResult = await qwenService.generateMatchExplanation(
            {
              skills: candidateMatrix.skills,
              totalYearsExperience: candidateMatrix.total_years_experience,
              domains: candidateMatrix.domains,
              locationSignals: candidateMatrix.location_signals,
            },
            {
              requiredSkills: jobMatrix.required_skills,
              preferredSkills: jobMatrix.preferred_skills,
              minYearsExperience: (job as any).min_years_experience,
            },
            score
          );
          explanation = explResult.explanation;
          gaps = explResult.gaps;
        } catch {
          explanation = 'Match scored using deterministic algorithm.';
          gaps = [];
        }
      }

      // Skip very low scores (likely poor matches).
      // Internship/entry jobs need a lower threshold so junior profiles are not filtered out.
      const minimumAcceptedScore = isInternshipOrEntryJob ? 5 : 20;
      if (score < minimumAcceptedScore) {
        console.log(`[MatchController] Skipping candidate ${candidateId} for job ${jobId} - score too low: ${score}`);
        return;
      }

      // Upsert match
      const [match] = await Match.findOrCreate({
        where: {
          candidate_id: candidateId,
          job_id: jobId,
        },
        defaults: {
          id: randomUUID(),
          candidate_id: candidateId,
          job_id: jobId,
          score,
          breakdown,
          explanation,
          gaps,
          status: 'pending',
        },
      });

      // Update if exists
      if (!match.isNewRecord) {
        await match.update({
          score,
          breakdown,
          explanation,
          gaps,
          calculated_at: new Date(),
        });
      }
      
      console.log(`[MatchController] ✓ Match saved: ${candidate.name} vs ${job.title} = ${score}%`);
    } catch (error: any) {
      console.error('Match calculation failed:', error);
    }
  }

  private async calculateMatchesAsync(jobId: string) {
    try {
      const job = await Job.findByPk(jobId, {
        include: [{ model: JobMatrix, as: 'matrix', required: true }],
      });

      if (!job || !(job as any).matrix) {
        console.error('Job or job matrix not found');
        return;
      }

      const jobMatrix = (job as any).matrix;

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

      for (const candidate of candidates) {
        await this.calculateMatchForCandidateAndJob(candidate.id, jobId);
      }
    } catch (error: any) {
      console.error('Match calculation failed:', error);
    }
  }

  async shortlist(req: Request, res: Response) {
    await this.handleRequest(req, res, async () => {
      const matchId = Array.isArray(req.params.matchId) ? req.params.matchId[0] : req.params.matchId;
      if (!matchId) {
        throw new Error('Match ID is required');
      }

      const match = await Match.findByPk(matchId);
      if (!match) {
        const error: any = new Error('Match not found');
        error.status = 404;
        throw error;
      }

      await match.update({ status: 'shortlisted' });

      return {
        id: match.id,
        candidateId: match.candidate_id,
        jobId: match.job_id,
        score: match.score,
        breakdown: match.breakdown,
        explanation: match.explanation,
        gaps: match.gaps,
        status: match.status,
        calculatedAt: match.calculated_at,
      };
    });
  }

  async reject(req: Request, res: Response) {
    await this.handleRequest(req, res, async () => {
      const matchId = Array.isArray(req.params.matchId) ? req.params.matchId[0] : req.params.matchId;
      if (!matchId) {
        throw new Error('Match ID is required');
      }

      const match = await Match.findByPk(matchId);
      if (!match) {
        const error: any = new Error('Match not found');
        error.status = 404;
        throw error;
      }

      await match.update({ status: 'rejected' });

      return {
        id: match.id,
        candidateId: match.candidate_id,
        jobId: match.job_id,
        score: match.score,
        breakdown: match.breakdown,
        explanation: match.explanation,
        gaps: match.gaps,
        status: match.status,
        calculatedAt: match.calculated_at,
      };
    });
  }
}

export const matchController = new MatchController();
