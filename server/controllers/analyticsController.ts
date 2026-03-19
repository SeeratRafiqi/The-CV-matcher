import { Response } from 'express';
import { Op, fn, col, literal } from 'sequelize';
import sequelize from '../db/config.js';
import {
  Application,
  Candidate,
  CompanyProfile,
  Job,
  Match,
  User,
  CandidateMatrix,
  UsageLog,
  TailoredResume,
} from '../db/models/index.js';
import { BaseController } from '../db/base/BaseController.js';
import type { AuthRequest } from '../middleware/auth.js';
import { FEATURE_CONFIG, getExternalApis, computeCostFromTokens, computeCostFromTtsChars, FEATURE_TO_API_ID, ALIBABA_PRICING_DOC_URL } from '../services/usageService.js';

export class AnalyticsController extends BaseController {
  protected model = Application; // primary model for queries

  // ==================== COMPANY ANALYTICS ====================
  async getCompanyAnalytics(req: AuthRequest, res: Response) {
    await this.handleRequest(req, res, async () => {
      if (!req.user) throw Object.assign(new Error('Authentication required'), { status: 401 });

      const company = await CompanyProfile.findOne({ where: { user_id: req.user.id } });
      if (!company) throw Object.assign(new Error('Company profile not found'), { status: 404 });

      // Get all company jobs
      const companyJobs = await Job.findAll({
        where: { company_id: company.id },
        attributes: ['id', 'title', 'status', 'created_at'],
      });
      const jobIds = companyJobs.map((j: any) => j.id);

      if (jobIds.length === 0) {
        return {
          overview: { activeJobs: 0, totalApplications: 0, avgTimeToHire: 0, conversionRate: 0, hired: 0 },
          applicationsOverTime: [],
          pipelineConversion: { applied: 0, screening: 0, interview: 0, offer: 0, hired: 0, rejected: 0 },
          topJobs: [],
          candidateLocations: {},
          skillsDemand: [],
        };
      }

      // Overview metrics
      const activeJobs = companyJobs.filter((j: any) => j.status === 'published').length;

      const totalApplications = await Application.count({
        where: { job_id: { [Op.in]: jobIds }, status: { [Op.ne]: 'withdrawn' } },
      });

      // Pipeline conversion rates
      const statusCounts: Record<string, number> = {};
      const statuses = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'];
      for (const status of statuses) {
        statusCounts[status] = await Application.count({
          where: { job_id: { [Op.in]: jobIds }, status },
        });
      }

      const hired = statusCounts.hired || 0;
      const conversionRate = totalApplications > 0 ? Math.round((hired / totalApplications) * 100) : 0;

      // Average time to hire (from applied to hired)
      let avgTimeToHire = 0;
      try {
        const hiredApps = await Application.findAll({
          where: { job_id: { [Op.in]: jobIds }, status: 'hired' },
          attributes: ['applied_at', 'updated_at'],
        });
        if (hiredApps.length > 0) {
          const totalDays = hiredApps.reduce((sum: number, app: any) => {
            const applied = new Date(app.applied_at).getTime();
            const updated = new Date(app.updated_at).getTime();
            return sum + (updated - applied) / (1000 * 60 * 60 * 24);
          }, 0);
          avgTimeToHire = Math.round(totalDays / hiredApps.length);
        }
      } catch (e) {
        // ignore
      }

      // Applications over time (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      let applicationsOverTime: { date: string; count: number }[] = [];
      try {
        const dailyApps = await Application.findAll({
          where: {
            job_id: { [Op.in]: jobIds },
            applied_at: { [Op.gte]: thirtyDaysAgo },
            status: { [Op.ne]: 'withdrawn' },
          },
          attributes: [
            [fn('DATE', col('applied_at')), 'date'],
            [fn('COUNT', col('id')), 'count'],
          ],
          group: [fn('DATE', col('applied_at'))],
          order: [[fn('DATE', col('applied_at')), 'ASC']],
          raw: true,
        });
        applicationsOverTime = (dailyApps as any[]).map((d: any) => ({
          date: d.date,
          count: parseInt(d.count, 10),
        }));
      } catch (e) {
        // Fallback if DATE function not supported
      }

      // Top performing jobs (most applications)
      const topJobs = await Promise.all(
        companyJobs.slice(0, 10).map(async (job: any) => {
          const appCount = await Application.count({
            where: { job_id: job.id, status: { [Op.ne]: 'withdrawn' } },
          });
          const avgScore = await Match.findOne({
            where: { job_id: job.id },
            attributes: [[fn('AVG', col('score')), 'avgScore']],
            raw: true,
          }) as any;

          return {
            id: job.id,
            title: job.title,
            status: job.status,
            applicationCount: appCount,
            avgMatchScore: Math.round(parseFloat(avgScore?.avgScore || '0')),
          };
        })
      );

      topJobs.sort((a, b) => b.applicationCount - a.applicationCount);

      // Candidate locations
      const candidateLocations: Record<string, number> = {};
      try {
        const apps = await Application.findAll({
          where: { job_id: { [Op.in]: jobIds }, status: { [Op.ne]: 'withdrawn' } },
          include: [
            { model: Candidate, as: 'candidate', attributes: ['country'] },
          ],
          attributes: ['id'],
        });
        for (const app of apps) {
          const country = (app as any).candidate?.country || 'Unknown';
          candidateLocations[country] = (candidateLocations[country] || 0) + 1;
        }
      } catch (e) {
        // ignore
      }

      // Most in-demand skills
      const skillsDemand: { skill: string; count: number }[] = [];
      const skillMap = new Map<string, number>();
      for (const job of companyJobs) {
        const j = job as any;
        const skills = [
          ...(Array.isArray(j.must_have_skills) ? j.must_have_skills : []),
          ...(Array.isArray(j.nice_to_have_skills) ? j.nice_to_have_skills : []),
        ];
        for (const skill of skills) {
          skillMap.set(skill, (skillMap.get(skill) || 0) + 1);
        }
      }
      for (const [skill, count] of skillMap) {
        skillsDemand.push({ skill, count });
      }
      skillsDemand.sort((a, b) => b.count - a.count);

      return {
        overview: {
          activeJobs,
          totalApplications,
          avgTimeToHire,
          conversionRate,
          hired,
        },
        applicationsOverTime,
        pipelineConversion: statusCounts,
        topJobs: topJobs.slice(0, 5),
        candidateLocations,
        skillsDemand: skillsDemand.slice(0, 10),
      };
    });
  }

  // ==================== CANDIDATE ANALYTICS ====================
  async getCandidateAnalytics(req: AuthRequest, res: Response) {
    await this.handleRequest(req, res, async () => {
      if (!req.user) throw Object.assign(new Error('Authentication required'), { status: 401 });

      const candidate = await Candidate.findOne({ where: { user_id: req.user.id } });
      if (!candidate) {
        return {
          overview: { totalApplications: 0, responseRate: 0, avgMatchScore: 0, interviewRate: 0 },
          applicationsByStatus: {},
          matchScoreTrend: [],
          skillsInDemand: [],
        };
      }

      // Applications breakdown
      const apps = await Application.findAll({
        where: { candidate_id: candidate.id },
        include: [
          { model: Match, as: 'match', attributes: ['score'], required: false },
          { model: Job, as: 'job', attributes: ['id', 'title', 'must_have_skills', 'nice_to_have_skills'] },
        ],
        order: [['applied_at', 'DESC']],
      });

      const totalApplications = apps.length;
      const applicationsByStatus: Record<string, number> = {};
      for (const app of apps) {
        applicationsByStatus[app.status] = (applicationsByStatus[app.status] || 0) + 1;
      }

      // Response rate (how many moved beyond "applied")
      const respondedCount = apps.filter(a => a.status !== 'applied' && a.status !== 'withdrawn').length;
      const responseRate = totalApplications > 0 ? Math.round((respondedCount / totalApplications) * 100) : 0;

      // Interview rate
      const interviewCount = apps.filter(a =>
        ['interview', 'offer', 'hired'].includes(a.status)
      ).length;
      const interviewRate = totalApplications > 0 ? Math.round((interviewCount / totalApplications) * 100) : 0;

      // Average match score
      const scores = apps
        .map((a: any) => a.match?.score)
        .filter((s: any) => s !== null && s !== undefined);
      const avgMatchScore = scores.length > 0
        ? Math.round(scores.reduce((sum: number, s: number) => sum + s, 0) / scores.length)
        : 0;

      // Match score trend (recent applications with scores)
      const matchScoreTrend = apps
        .filter((a: any) => a.match?.score)
        .slice(0, 10)
        .map((a: any) => ({
          jobTitle: (a as any).job?.title || 'Unknown',
          score: a.match?.score || 0,
          appliedAt: a.applied_at,
        }))
        .reverse();

      // Skills in demand from jobs they applied to
      const skillDemandMap = new Map<string, number>();
      for (const app of apps) {
        const job = (app as any).job;
        if (job) {
          const skills = [
            ...(Array.isArray(job.must_have_skills) ? job.must_have_skills : []),
          ];
          for (const skill of skills) {
            skillDemandMap.set(skill, (skillDemandMap.get(skill) || 0) + 1);
          }
        }
      }
      const skillsInDemand = Array.from(skillDemandMap)
        .map(([skill, count]) => ({ skill, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return {
        overview: {
          totalApplications,
          responseRate,
          avgMatchScore,
          interviewRate,
        },
        applicationsByStatus,
        matchScoreTrend,
        skillsInDemand,
      };
    });
  }

  // ==================== ADMIN ANALYTICS ====================
  async getAdminAnalytics(req: AuthRequest, res: Response) {
    await this.handleRequest(req, res, async () => {
      if (!req.user) throw Object.assign(new Error('Authentication required'), { status: 401 });

      // Platform stats
      const totalUsers = await User.count();
      const totalCandidates = await User.count({ where: { role: 'candidate' } });
      const totalCompanies = await User.count({ where: { role: 'company' } });
      const totalJobs = await Job.count();
      const activeJobs = await Job.count({ where: { status: 'published' } });
      const totalApplications = await Application.count({
        where: { status: { [Op.ne]: 'withdrawn' } },
      });
      const totalMatches = await Match.count();

      // Growth over time (last 30 days) - user registrations
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      let userGrowth: { date: string; count: number }[] = [];
      try {
        const dailyUsers = await User.findAll({
          where: { created_at: { [Op.gte]: thirtyDaysAgo } },
          attributes: [
            [fn('DATE', col('created_at')), 'date'],
            [fn('COUNT', col('id')), 'count'],
          ],
          group: [fn('DATE', col('created_at'))],
          order: [[fn('DATE', col('created_at')), 'ASC']],
          raw: true,
        });
        userGrowth = (dailyUsers as any[]).map((d: any) => ({
          date: d.date,
          count: parseInt(d.count, 10),
        }));
      } catch (e) {
        // ignore
      }

      // Applications over time (last 30 days)
      let applicationGrowth: { date: string; count: number }[] = [];
      try {
        const dailyApps = await Application.findAll({
          where: {
            applied_at: { [Op.gte]: thirtyDaysAgo },
            status: { [Op.ne]: 'withdrawn' },
          },
          attributes: [
            [fn('DATE', col('applied_at')), 'date'],
            [fn('COUNT', col('id')), 'count'],
          ],
          group: [fn('DATE', col('applied_at'))],
          order: [[fn('DATE', col('applied_at')), 'ASC']],
          raw: true,
        });
        applicationGrowth = (dailyApps as any[]).map((d: any) => ({
          date: d.date,
          count: parseInt(d.count, 10),
        }));
      } catch (e) {
        // ignore
      }

      // Most in-demand skills (from all jobs)
      const allJobs = await Job.findAll({ attributes: ['must_have_skills', 'nice_to_have_skills'] });
      const skillMap = new Map<string, number>();
      for (const job of allJobs) {
        const j = job as any;
        const skills = [
          ...(Array.isArray(j.must_have_skills) ? j.must_have_skills : []),
          ...(Array.isArray(j.nice_to_have_skills) ? j.nice_to_have_skills : []),
        ];
        for (const skill of skills) {
          skillMap.set(skill, (skillMap.get(skill) || 0) + 1);
        }
      }
      const topSkills = Array.from(skillMap)
        .map(([skill, count]) => ({ skill, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15);

      // Active companies (by number of jobs posted)
      const companyJobCounts: { companyName: string; jobCount: number }[] = [];
      try {
        const companies = await CompanyProfile.findAll({
          attributes: ['id', 'company_name'],
        });
        for (const cp of companies) {
          const count = await Job.count({ where: { company_id: (cp as any).id } });
          if (count > 0) {
            companyJobCounts.push({
              companyName: (cp as any).company_name,
              jobCount: count,
            });
          }
        }
        companyJobCounts.sort((a, b) => b.jobCount - a.jobCount);
      } catch (e) {
        // ignore
      }

      // Application status distribution
      const statusDistribution: Record<string, number> = {};
      const statuses = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'];
      for (const status of statuses) {
        statusDistribution[status] = await Application.count({ where: { status } });
      }

      return {
        overview: {
          totalUsers,
          totalCandidates,
          totalCompanies,
          totalJobs,
          activeJobs,
          totalApplications,
          totalMatches,
        },
        userGrowth,
        applicationGrowth,
        topSkills,
        activeCompanies: companyJobCounts.slice(0, 10),
        statusDistribution,
      };
    });
  }

  /** Admin usage & cost: platform spend, API calls, credits, tokens; per-user breakdown. */
  async getAdminUsage(req: AuthRequest, res: Response) {
    await this.handleRequest(req, res, async () => {
      if (!req.user) throw Object.assign(new Error('Authentication required'), { status: 401 });

      const logs = await UsageLog.findAll({ raw: true });
      const tailorCredits = FEATURE_CONFIG['tailor_resume']?.creditsPerCall ?? 1;

      // Platform totals from logs
      let platformCost = 0;
      let platformCredits = 0;
      let platformTokens = 0;
      let platformCalls = 0;
      const byFeature: Record<string, { feature: string; displayName: string; calls: number; cost: number; credits: number; tokens: number }> = {};

      for (const f of Object.keys(FEATURE_CONFIG)) {
        byFeature[f] = {
          feature: f,
          displayName: FEATURE_CONFIG[f].displayName,
          calls: 0,
          cost: 0,
          credits: 0,
          tokens: 0,
        };
      }

      for (const row of logs) {
        const isSuccess = (row as any).status !== 'failure';
        const inputT = Number(row.input_tokens ?? 0) || 0;
        const outputT = Number(row.output_tokens ?? 0) || 0;
        const ttsChars = Number((row as any).tts_characters ?? 0) || 0;
        const hasTokens = inputT > 0 || outputT > 0;
        const apiId = FEATURE_TO_API_ID[row.feature ?? ''] ?? 'dashscope_llm';
        let cost = Number(row.cost ?? 0);
        if (hasTokens) cost = computeCostFromTokens(apiId, inputT, outputT);
        else if (ttsChars > 0) cost = computeCostFromTtsChars(apiId, ttsChars);
        const credits = Number(row.credits_used ?? 0);
        const tokens = Number(row.tokens_used ?? 0);
        platformCalls += 1;
        if (isSuccess) {
          platformCost += cost;
          platformCredits += credits;
          platformTokens += tokens;
        }
        const f = row.feature ?? 'other';
        if (!byFeature[f]) byFeature[f] = { feature: f, displayName: FEATURE_CONFIG[f]?.displayName ?? f, calls: 0, cost: 0, credits: 0, tokens: 0 };
        byFeature[f].calls += 1;
        if (isSuccess) {
          byFeature[f].cost += cost;
          byFeature[f].credits += credits;
          byFeature[f].tokens += tokens;
        }
      }

      // Legacy: TailoredResume counts (no usage_log; cost stays 0 — real cost is from token usage only)
      const tailoredCount = await TailoredResume.count();
      platformCalls += tailoredCount;
      platformCredits += tailoredCount * tailorCredits;
      if (byFeature['tailor_resume']) {
        byFeature['tailor_resume'].calls += tailoredCount;
        byFeature['tailor_resume'].credits += tailoredCount * tailorCredits;
      }

      // Per-user: from logs
      const userMap: Record<string, { id: string; name: string; email: string; role: string; totalCost: number; totalCredits: number; totalTokens: number; byFeature: Record<string, { calls: number; cost: number; credits: number; tokens: number }> }> = {};

      const users = await User.findAll({
        where: { role: { [Op.not]: 'admin' } },
        attributes: ['id', 'name', 'email', 'role'],
        order: [['created_at', 'DESC']],
      });
      for (const u of users) {
        const ua = u as any;
        userMap[ua.id] = {
          id: ua.id,
          name: ua.name || '',
          email: ua.email || '',
          role: ua.role,
          totalCost: 0,
          totalCredits: 0,
          totalTokens: 0,
          byFeature: {},
        };
      }

      for (const row of logs) {
        const uid = row.user_id;
        if (!userMap[uid]) continue;
        const isSuccess = (row as any).status !== 'failure';
        const inputT = Number(row.input_tokens ?? 0) || 0;
        const outputT = Number(row.output_tokens ?? 0) || 0;
        const hasTokens = inputT > 0 || outputT > 0;
        const apiId = FEATURE_TO_API_ID[row.feature ?? ''] ?? 'dashscope_llm';
        let cost = Number(row.cost ?? 0);
        const ttsChars = Number((row as any).tts_characters ?? 0) || 0;
        if (hasTokens) cost = computeCostFromTokens(apiId, inputT, outputT);
        else if (ttsChars > 0) cost = computeCostFromTtsChars(apiId, ttsChars);
        const credits = Number(row.credits_used ?? 0);
        const tokens = Number(row.tokens_used ?? 0);
        if (isSuccess) {
          userMap[uid].totalCost += cost;
          userMap[uid].totalCredits += credits;
          userMap[uid].totalTokens += tokens;
        }
        const f = row.feature ?? 'other';
        if (!userMap[uid].byFeature[f]) userMap[uid].byFeature[f] = { calls: 0, cost: 0, credits: 0, tokens: 0 };
        userMap[uid].byFeature[f].calls += 1;
        if (isSuccess) {
          userMap[uid].byFeature[f].cost += cost;
          userMap[uid].byFeature[f].credits += credits;
          userMap[uid].byFeature[f].tokens += tokens;
        }
      }

      // Legacy: TailoredResume per candidate (map to user)
      const candidates = await Candidate.findAll({ attributes: ['id', 'user_id'] });
      for (const c of candidates) {
        const cc = c as any;
        const count = await TailoredResume.count({ where: { candidate_id: cc.id } });
        if (count === 0 || !cc.user_id) continue;
        if (userMap[cc.user_id]) {
          userMap[cc.user_id].totalCredits += count * tailorCredits;
          if (!userMap[cc.user_id].byFeature['tailor_resume']) {
            userMap[cc.user_id].byFeature['tailor_resume'] = { calls: 0, cost: 0, credits: 0, tokens: 0 };
          }
          userMap[cc.user_id].byFeature['tailor_resume'].calls += count;
          userMap[cc.user_id].byFeature['tailor_resume'].credits += count * tailorCredits;
        }
      }

      const usersList = Object.values(userMap).map((u) => ({
        ...u,
        totalCost: Math.round(u.totalCost * 100) / 100,
        totalCredits: u.totalCredits,
        totalTokens: u.totalTokens,
        byFeature: u.byFeature,
      }));

      const externalApis = getExternalApis();
      const byFeatureList = Object.values(byFeature).filter((b) => b.calls > 0 || b.cost > 0);
      return {
        platform: {
          totalCost: Math.round(platformCost * 100) / 100,
          totalCredits: platformCredits,
          totalTokens: platformTokens,
          totalApiCalls: platformCalls,
          byFeature: Array.isArray(byFeatureList) ? byFeatureList : [],
        },
        externalApis: Array.isArray(externalApis) ? externalApis : [],
        pricingDocUrl: ALIBABA_PRICING_DOC_URL,
        featureConfig: Object.entries(FEATURE_CONFIG).map(([key, val]) => ({
          feature: key,
          displayName: val.displayName,
          creditsPerCall: val.creditsPerCall,
        })),
        users: usersList,
      };
    });
  }

  /** Admin call statistics: total calls, failures, rate limit/content moderation errors, token totals, averages. Optional ?days=7 for last N days. */
  async getAdminCallStats(req: AuthRequest, res: Response) {
    await this.handleRequest(req, res, async () => {
      if (!req.user) throw Object.assign(new Error('Authentication required'), { status: 401 });

      const days = typeof (req as any).query?.days === 'string' ? parseInt((req as any).query.days, 10) : undefined;
      const where: any = {};
      if (Number.isFinite(days) && days > 0) {
        const since = new Date();
        since.setDate(since.getDate() - days);
        where.created_at = { [Op.gte]: since };
      }

      const logs = await UsageLog.findAll({ where, raw: true });

      let totalCallCount = logs.length;
      let totalFailures = 0;
      let rateLimitErrorCount = 0;
      let contentModerationErrorCount = 0;
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalCost = 0;
      let successCallCount = 0;

      for (const row of logs) {
        const status = (row as any).status;
        const errorType = (row as any).error_type;
        if (status === 'failure') {
          totalFailures += 1;
          if (errorType === 'rate_limit') rateLimitErrorCount += 1;
          else if (errorType === 'content_moderation') contentModerationErrorCount += 1;
          continue;
        }
        successCallCount += 1;
        const inputT = Number(row.input_tokens ?? 0) || 0;
        const outputT = Number(row.output_tokens ?? 0) || 0;
        const ttsChars = Number((row as any).tts_characters ?? 0) || 0;
        const apiId = FEATURE_TO_API_ID[row.feature ?? ''] ?? 'dashscope_llm';
        totalInputTokens += inputT;
        totalOutputTokens += outputT;
        if (inputT > 0 || outputT > 0) {
          totalCost += computeCostFromTokens(apiId, inputT, outputT);
        } else if (ttsChars > 0) {
          totalCost += computeCostFromTtsChars(apiId, ttsChars);
        } else {
          totalCost += Number(row.cost ?? 0);
        }
      }

      const totalTokens = totalInputTokens + totalOutputTokens;
      const failureRate = totalCallCount > 0 ? (totalFailures / totalCallCount) * 100 : 0;
      const avgInputPerRequest = successCallCount > 0 ? totalInputTokens / successCallCount : 0;
      const avgOutputPerRequest = successCallCount > 0 ? totalOutputTokens / successCallCount : 0;

      return {
        totalCallCount,
        totalFailures,
        failureRate: Math.round(failureRate * 100) / 100,
        rateLimitErrorCount,
        contentModerationErrorCount,
        totalTokens,
        totalInputTokens,
        totalOutputTokens,
        successCallCount,
        avgInputPerRequest: Math.round(avgInputPerRequest * 10) / 10,
        avgOutputPerRequest: Math.round(avgOutputPerRequest * 10) / 10,
        totalCost: Math.round(totalCost * 10000) / 10000,
        days: Number.isFinite(days) ? days : null,
      };
    });
  }
}

export const analyticsController = new AnalyticsController();
