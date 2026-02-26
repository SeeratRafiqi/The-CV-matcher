import { Response } from 'express';
import { randomUUID } from 'crypto';
import { Op } from 'sequelize';
import {
  Application,
  ApplicationHistory,
  Candidate,
  CompanyProfile,
  Conversation,
  InterviewAnswer,
  InterviewAssessment,
  InterviewAttempt,
  InterviewQuestion,
  InterviewReport,
  Job,
  Message,
} from '../db/models/index.js';
import { BaseController } from '../db/base/BaseController.js';
import type { AuthRequest } from '../middleware/auth.js';
import { qwenService } from '../services/qwen.js';
import { notificationService } from '../services/notificationService.js';
import { scoreInterviewAnswers } from '../services/interviewScoring.js';

type AssessmentWithRelations = InterviewAssessment & {
  application?: Application & { job?: Job | null };
  questions?: InterviewQuestion[];
  attempt?: InterviewAttempt | null;
};

type GeneratedQuestion = {
  question: string;
  options: string[];
  correctOption: string;
  competencyTag: string;
  weight: number;
};

const REMINDER_WINDOW_HOURS = 6;

export class InterviewController extends BaseController {
  protected model = InterviewAssessment;

  async assign(req: AuthRequest, res: Response) {
    await this.handleRequest(req, res, async () => {
      if (!req.user) throw Object.assign(new Error('Authentication required'), { status: 401 });

      const { applicationId } = req.body || {};
      if (!applicationId) throw Object.assign(new Error('applicationId is required'), { status: 400 });

      const application = await Application.findByPk(applicationId, {
        include: [{ model: Job, as: 'job' }],
      }) as (Application & { job?: Job }) | null;
      if (!application) throw Object.assign(new Error('Application not found'), { status: 404 });
      if (application.status !== 'interview') {
        throw Object.assign(new Error('Assessment can only be assigned when application is in interview stage'), { status: 400 });
      }

      const job = application.job;
      if (!job) throw Object.assign(new Error('Job not found for application'), { status: 404 });

      const company = await this.assertCompanyAccess(req, job.company_id);
      const candidate = await Candidate.findByPk(application.candidate_id);
      if (!candidate) throw Object.assign(new Error('Candidate not found'), { status: 404 });

      const existingActive = await InterviewAssessment.findOne({
        where: { application_id: application.id, is_active: true, status: { [Op.in]: ['assigned', 'in_progress'] } },
      });
      if (existingActive) {
        throw Object.assign(new Error('An active interview assessment already exists for this application'), { status: 409 });
      }

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const assessment = await InterviewAssessment.create({
        id: randomUUID(),
        application_id: application.id,
        candidate_id: candidate.id,
        assigned_by: req.user.id,
        assigned_at: new Date(),
        expires_at: expiresAt,
        duration_minutes: 20,
        max_questions: 10,
        status: 'assigned',
        is_active: true,
      });

      const questions = await this.generateAssessmentQuestions(job, candidate);
      await InterviewQuestion.bulkCreate(
        questions.map((q: GeneratedQuestion, index: number) => ({
          id: randomUUID(),
          assessment_id: assessment.id,
          question_text: q.question,
          options: q.options,
          correct_option: q.correctOption,
          competency_tag: q.competencyTag,
          weight: q.weight,
          order_index: index,
        }))
      );

      await ApplicationHistory.create({
        id: randomUUID(),
        application_id: application.id,
        from_status: application.status,
        to_status: application.status,
        changed_by: req.user.id,
        note: 'Behavior assessment assigned',
      });

      await notificationService.notifyInterviewAssigned(candidate.id, job.id, assessment.id, expiresAt);
      await this.sendSystemInterviewMessage({
        companyUserId: company.user_id,
        candidateUserId: candidate.user_id,
        jobId: job.id,
        applicationId: application.id,
        content: `Your behavior assessment for "${job.title}" is now available. You have 24 hours to start and complete it.`,
      });

      return {
        message: 'Interview assessment assigned',
        assessment: await this.buildAssessmentPayload(assessment.id, true),
      };
    });
  }

  async reissue(req: AuthRequest, res: Response) {
    await this.handleRequest(req, res, async () => {
      if (!req.user) throw Object.assign(new Error('Authentication required'), { status: 401 });

      const { id } = req.params as { id: string };
      const oldAssessment = await InterviewAssessment.findByPk(id, {
        include: [
          { model: Application, as: 'application', include: [{ model: Job, as: 'job' }] },
        ],
      }) as AssessmentWithRelations | null;
      if (!oldAssessment) throw Object.assign(new Error('Assessment not found'), { status: 404 });
      if (oldAssessment.status !== 'expired') {
        throw Object.assign(new Error('Only expired assessments can be reissued'), { status: 400 });
      }

      const application = oldAssessment.application;
      const job = application?.job as Job | undefined;
      if (!application || !job) throw Object.assign(new Error('Application or job not found'), { status: 404 });

      const company = await this.assertCompanyAccess(req, job.company_id);
      const candidate = await Candidate.findByPk(oldAssessment.candidate_id);
      if (!candidate) throw Object.assign(new Error('Candidate not found'), { status: 404 });

      await oldAssessment.update({ is_active: false, updated_at: new Date() });

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const assessment = await InterviewAssessment.create({
        id: randomUUID(),
        application_id: oldAssessment.application_id,
        candidate_id: oldAssessment.candidate_id,
        assigned_by: req.user.id,
        assigned_at: new Date(),
        expires_at: expiresAt,
        duration_minutes: 20,
        max_questions: 10,
        status: 'assigned',
        is_active: true,
      });

      const questions = await this.generateAssessmentQuestions(job, candidate);
      await InterviewQuestion.bulkCreate(
        questions.map((q: GeneratedQuestion, index: number) => ({
          id: randomUUID(),
          assessment_id: assessment.id,
          question_text: q.question,
          options: q.options,
          correct_option: q.correctOption,
          competency_tag: q.competencyTag,
          weight: q.weight,
          order_index: index,
        }))
      );

      await ApplicationHistory.create({
        id: randomUUID(),
        application_id: application.id,
        from_status: application.status,
        to_status: application.status,
        changed_by: req.user.id,
        note: 'Behavior assessment reissued after expiry',
      });

      await notificationService.notifyInterviewAssigned(candidate.id, job.id, assessment.id, expiresAt);
      await this.sendSystemInterviewMessage({
        companyUserId: company.user_id,
        candidateUserId: candidate.user_id,
        jobId: job.id,
        applicationId: application.id,
        content: `A new behavior assessment for "${job.title}" has been assigned to you. You now have 24 hours to complete it.`,
      });

      return {
        message: 'Interview assessment reissued',
        assessment: await this.buildAssessmentPayload(assessment.id, true),
      };
    });
  }

  async getForApplication(req: AuthRequest, res: Response) {
    await this.handleRequest(req, res, async () => {
      if (!req.user) throw Object.assign(new Error('Authentication required'), { status: 401 });
      const { applicationId } = req.params as { applicationId: string };
      const application = await Application.findByPk(applicationId, {
        include: [{ model: Job, as: 'job' }],
      }) as (Application & { job?: Job }) | null;
      if (!application) throw Object.assign(new Error('Application not found'), { status: 404 });
      if (!application.job) throw Object.assign(new Error('Job not found'), { status: 404 });

      await this.assertCompanyAccess(req, application.job.company_id);

      const assessments = await InterviewAssessment.findAll({
        where: { application_id: applicationId },
        order: [['assigned_at', 'DESC']],
      });

      const result = [];
      for (const assessment of assessments) {
        result.push(await this.buildAssessmentPayload(assessment.id, false));
      }
      return { assessments: result };
    });
  }

  async getMyAssessments(req: AuthRequest, res: Response) {
    await this.handleRequest(req, res, async () => {
      if (!req.user) throw Object.assign(new Error('Authentication required'), { status: 401 });
      const candidate = await Candidate.findOne({ where: { user_id: req.user.id } });
      if (!candidate) return { assessments: [] };

      await this.processExpirySweep();

      const assessments = await InterviewAssessment.findAll({
        where: { candidate_id: candidate.id, is_active: true },
        include: [{ model: Application, as: 'application', include: [{ model: Job, as: 'job' }] }],
        order: [['assigned_at', 'DESC']],
      }) as AssessmentWithRelations[];

      const response = [];
      for (const assessment of assessments) {
        response.push(await this.buildAssessmentPayload(assessment.id, false));
      }
      return { assessments: response };
    });
  }

  async getCandidateAssessment(req: AuthRequest, res: Response) {
    await this.handleRequest(req, res, async () => {
      if (!req.user) throw Object.assign(new Error('Authentication required'), { status: 401 });
      const { id } = req.params as { id: string };

      const candidate = await Candidate.findOne({ where: { user_id: req.user.id } });
      if (!candidate) throw Object.assign(new Error('Candidate profile not found'), { status: 404 });

      const assessment = await this.requireCandidateAssessment(id, candidate.id);
      await this.expireIfNeeded(assessment);
      await this.autoSubmitIfTimedOut(assessment);

      return { assessment: await this.buildAssessmentPayload(id, true) };
    });
  }

  async start(req: AuthRequest, res: Response) {
    await this.handleRequest(req, res, async () => {
      if (!req.user) throw Object.assign(new Error('Authentication required'), { status: 401 });
      const { id } = req.params as { id: string };

      const candidate = await Candidate.findOne({ where: { user_id: req.user.id } });
      if (!candidate) throw Object.assign(new Error('Candidate profile not found'), { status: 404 });

      const assessment = await this.requireCandidateAssessment(id, candidate.id);
      await this.expireIfNeeded(assessment);
      if (assessment.status === 'expired') {
        throw Object.assign(new Error('Assessment has expired'), { status: 400 });
      }
      if (assessment.status === 'submitted') {
        throw Object.assign(new Error('Assessment already submitted'), { status: 400 });
      }

      const now = new Date();
      let attempt = await InterviewAttempt.findOne({ where: { assessment_id: id } });
      if (!attempt) {
        attempt = await InterviewAttempt.create({
          id: randomUUID(),
          assessment_id: id,
          candidate_id: candidate.id,
          started_at: now,
          status: 'in_progress',
        });
      }

      if (!assessment.started_at) {
        await assessment.update({
          started_at: now,
          status: 'in_progress',
          updated_at: now,
        });
      } else if (assessment.status !== 'in_progress') {
        await assessment.update({
          status: 'in_progress',
          updated_at: now,
        });
      }

      const questionIds = (await InterviewQuestion.findAll({
        where: { assessment_id: id },
        attributes: ['id'],
      })).map((q) => q.id);

      if (questionIds.length > 0) {
        const existingAnswerCount = await InterviewAnswer.count({ where: { attempt_id: attempt.id } });
        if (existingAnswerCount === 0) {
          await InterviewAnswer.bulkCreate(
            questionIds.map((questionId) => ({
              id: randomUUID(),
              attempt_id: attempt!.id,
              question_id: questionId,
              selected_option: null,
              answered_at: null,
            }))
          );
        }
      }

      await ApplicationHistory.create({
        id: randomUUID(),
        application_id: assessment.application_id,
        from_status: 'interview',
        to_status: 'interview',
        changed_by: req.user.id,
        note: 'Behavior assessment started by candidate',
      });

      return { assessment: await this.buildAssessmentPayload(id, true) };
    });
  }

  async saveAnswer(req: AuthRequest, res: Response) {
    await this.handleRequest(req, res, async () => {
      if (!req.user) throw Object.assign(new Error('Authentication required'), { status: 401 });
      const { id, questionId } = req.params as { id: string; questionId: string };
      const { selectedOption } = req.body || {};
      if (!selectedOption) throw Object.assign(new Error('selectedOption is required'), { status: 400 });

      const candidate = await Candidate.findOne({ where: { user_id: req.user.id } });
      if (!candidate) throw Object.assign(new Error('Candidate profile not found'), { status: 404 });

      const assessment = await this.requireCandidateAssessment(id, candidate.id);
      await this.expireIfNeeded(assessment);
      await this.autoSubmitIfTimedOut(assessment);

      if (assessment.status !== 'in_progress') {
        throw Object.assign(new Error('Assessment is not in progress'), { status: 400 });
      }

      const question = await InterviewQuestion.findOne({
        where: { id: questionId, assessment_id: id },
      });
      if (!question) throw Object.assign(new Error('Question not found'), { status: 404 });
      if (!Array.isArray(question.options) || !question.options.includes(selectedOption)) {
        throw Object.assign(new Error('Invalid option selected'), { status: 400 });
      }

      const attempt = await InterviewAttempt.findOne({ where: { assessment_id: id } });
      if (!attempt || attempt.status !== 'in_progress') {
        throw Object.assign(new Error('Assessment attempt not in progress'), { status: 400 });
      }

      const existing = await InterviewAnswer.findOne({
        where: { attempt_id: attempt.id, question_id: question.id },
      });
      if (existing) {
        await existing.update({
          selected_option: selectedOption,
          answered_at: new Date(),
          updated_at: new Date(),
        });
      } else {
        await InterviewAnswer.create({
          id: randomUUID(),
          attempt_id: attempt.id,
          question_id: question.id,
          selected_option: selectedOption,
          answered_at: new Date(),
        });
      }

      return { message: 'Answer saved' };
    });
  }

  async submit(req: AuthRequest, res: Response) {
    await this.handleRequest(req, res, async () => {
      if (!req.user) throw Object.assign(new Error('Authentication required'), { status: 401 });
      const { id } = req.params as { id: string };
      const { autoSubmitted = false } = req.body || {};

      const candidate = await Candidate.findOne({ where: { user_id: req.user.id } });
      if (!candidate) throw Object.assign(new Error('Candidate profile not found'), { status: 404 });

      const assessment = await this.requireCandidateAssessment(id, candidate.id);
      await this.expireIfNeeded(assessment);

      if (assessment.status === 'submitted') {
        return { assessment: await this.buildAssessmentPayload(id, false) };
      }
      if (assessment.status === 'expired') {
        throw Object.assign(new Error('Assessment has expired'), { status: 400 });
      }

      const attempt = await InterviewAttempt.findOne({ where: { assessment_id: id } });
      if (!attempt) {
        throw Object.assign(new Error('No attempt found. Start the assessment first.'), { status: 400 });
      }

      await this.finalizeSubmission(assessment, attempt, !!autoSubmitted);

      return {
        message: 'Assessment submitted',
        assessment: await this.buildAssessmentPayload(id, false),
      };
    });
  }

  async getReport(req: AuthRequest, res: Response) {
    await this.handleRequest(req, res, async () => {
      if (!req.user) throw Object.assign(new Error('Authentication required'), { status: 401 });
      const { id } = req.params as { id: string };

      const assessment = await InterviewAssessment.findByPk(id, {
        include: [{ model: Application, as: 'application', include: [{ model: Job, as: 'job' }] }],
      }) as AssessmentWithRelations | null;
      if (!assessment || !assessment.application?.job) {
        throw Object.assign(new Error('Assessment not found'), { status: 404 });
      }

      if (req.user.role === 'candidate') {
        const candidate = await Candidate.findOne({ where: { user_id: req.user.id } });
        if (!candidate || candidate.id !== assessment.candidate_id) {
          throw Object.assign(new Error('Access denied'), { status: 403 });
        }
      } else {
        await this.assertCompanyAccess(req, assessment.application.job.company_id);
      }

      const attempt = await InterviewAttempt.findOne({ where: { assessment_id: id } });
      if (!attempt) throw Object.assign(new Error('Attempt not found'), { status: 404 });
      const report = await InterviewReport.findOne({ where: { attempt_id: attempt.id } });
      if (!report) throw Object.assign(new Error('Report not ready yet'), { status: 404 });

      return {
        report: {
          id: report.id,
          overallScore: report.overall_score,
          dimensionScores: report.dimension_scores || {},
          strengths: report.strengths || [],
          concerns: report.concerns || [],
          recommendation: report.recommendation,
          generatedAt: report.generated_at,
        },
      };
    });
  }

  async runExpirySweep(req: AuthRequest, res: Response) {
    await this.handleRequest(req, res, async () => {
      if (!req.user || req.user.role !== 'admin') {
        throw Object.assign(new Error('Admin access required'), { status: 403 });
      }
      const result = await this.processExpirySweep();
      return { message: 'Expiry sweep completed', ...result };
    });
  }

  async processExpirySweep() {
    const now = new Date();
    const expirable = await InterviewAssessment.findAll({
      where: {
        status: { [Op.in]: ['assigned', 'in_progress'] },
        expires_at: { [Op.lt]: now },
      },
    });

    let expiredCount = 0;
    for (const assessment of expirable) {
      const changed = await this.expireIfNeeded(assessment, true);
      if (changed) expiredCount += 1;
    }

    const reminderThreshold = new Date(now.getTime() + REMINDER_WINDOW_HOURS * 60 * 60 * 1000);
    const reminderCandidates = await InterviewAssessment.findAll({
      where: {
        status: { [Op.in]: ['assigned', 'in_progress'] },
        reminder_sent_at: null,
        expires_at: { [Op.lte]: reminderThreshold, [Op.gt]: now },
      },
      include: [{ model: Application, as: 'application' }],
    }) as AssessmentWithRelations[];

    let reminderCount = 0;
    for (const assessment of reminderCandidates) {
      const application = assessment.application || await Application.findByPk(assessment.application_id);
      if (!application) continue;
      await notificationService.notifyInterviewDeadlineReminder(
        assessment.candidate_id,
        application.job_id,
        assessment.id,
        assessment.expires_at
      );
      await assessment.update({ reminder_sent_at: now, updated_at: now });
      reminderCount += 1;
    }

    return { expiredCount, reminderCount };
  }

  private async requireCandidateAssessment(assessmentId: string, candidateId: string) {
    const assessment = await InterviewAssessment.findOne({
      where: { id: assessmentId, candidate_id: candidateId, is_active: true },
    });
    if (!assessment) throw Object.assign(new Error('Assessment not found'), { status: 404 });
    return assessment;
  }

  private async assertCompanyAccess(req: AuthRequest, companyId?: string | null) {
    if (req.user?.role === 'admin') {
      if (!companyId) throw Object.assign(new Error('Job is not linked to a company'), { status: 400 });
      const company = await CompanyProfile.findByPk(companyId);
      if (!company) throw Object.assign(new Error('Company profile not found'), { status: 404 });
      return company;
    }

    const company = await CompanyProfile.findOne({ where: { user_id: req.user!.id } });
    if (!company) throw Object.assign(new Error('Company profile not found'), { status: 404 });
    if (companyId && company.id !== companyId) {
      throw Object.assign(new Error('Access denied'), { status: 403 });
    }
    return company;
  }

  private async buildAssessmentPayload(assessmentId: string, includeQuestions: boolean) {
    const assessment = await InterviewAssessment.findByPk(assessmentId, {
      include: [
        { model: InterviewQuestion, as: 'questions', order: [['order_index', 'ASC']] as any },
        { model: InterviewAttempt, as: 'attempt' },
        { model: Application, as: 'application', include: [{ model: Job, as: 'job' }] },
      ],
    }) as AssessmentWithRelations | null;
    if (!assessment) return null;

    const now = Date.now();
    const expiryMs = new Date(assessment.expires_at).getTime();
    const attempt = assessment.attempt || null;
    let answersByQuestionId: Record<string, string | null> = {};
    if (attempt) {
      const answers = await InterviewAnswer.findAll({ where: { attempt_id: attempt.id } });
      answersByQuestionId = answers.reduce((acc: Record<string, string | null>, item: InterviewAnswer) => {
        acc[item.question_id] = item.selected_option || null;
        return acc;
      }, {});
    }
    const startedMs = attempt?.started_at ? new Date(attempt.started_at).getTime() : null;
    const durationSeconds = assessment.duration_minutes * 60;
    const elapsedSeconds = startedMs ? Math.max(0, Math.floor((now - startedMs) / 1000)) : 0;
    const timerRemaining = startedMs ? Math.max(0, durationSeconds - elapsedSeconds) : durationSeconds;
    const deadlineRemaining = Math.max(0, Math.floor((expiryMs - now) / 1000));
    const remainingSeconds = assessment.status === 'in_progress'
      ? Math.min(timerRemaining, deadlineRemaining)
      : deadlineRemaining;

    const questions = (assessment.questions || [])
      .sort((a, b) => a.order_index - b.order_index)
      .slice(0, assessment.max_questions)
      .map((q) => ({
        id: q.id,
        question: q.question_text,
        options: q.options || [],
        order: q.order_index,
        competencyTag: q.competency_tag || null,
        selectedOption: answersByQuestionId[q.id] ?? null,
      }));

    const responseQuestions = includeQuestions ? questions : questions.map(({ id, question, options, order, competencyTag }) => ({
      id, question, options, order, competencyTag,
    }));

    return {
      id: assessment.id,
      applicationId: assessment.application_id,
      candidateId: assessment.candidate_id,
      status: assessment.status,
      assignedAt: assessment.assigned_at,
      expiresAt: assessment.expires_at,
      durationMinutes: assessment.duration_minutes,
      maxQuestions: assessment.max_questions,
      startedAt: assessment.started_at,
      submittedAt: assessment.submitted_at,
      autoSubmitted: assessment.auto_submitted,
      remainingSeconds,
      questions: responseQuestions,
      attempt: attempt ? {
        id: attempt.id,
        status: attempt.status,
        startedAt: attempt.started_at,
        submittedAt: attempt.submitted_at,
      } : null,
      job: assessment.application?.job ? {
        id: assessment.application.job.id,
        title: assessment.application.job.title,
      } : null,
    };
  }

  private async expireIfNeeded(assessment: InterviewAssessment, force = false): Promise<boolean> {
    const now = new Date();
    if (!force && assessment.status === 'expired') return false;
    if (!force && new Date(assessment.expires_at) >= now) return false;

    await assessment.update({
      status: 'expired',
      is_active: false,
      submitted_at: assessment.submitted_at || now,
      updated_at: now,
    });

    const attempt = await InterviewAttempt.findOne({ where: { assessment_id: assessment.id } });
    if (attempt && attempt.status === 'in_progress') {
      await attempt.update({
        status: 'expired',
        submitted_at: now,
        auto_submitted: true,
        updated_at: now,
      });
    }

    const application = await Application.findByPk(assessment.application_id);
    if (application && !assessment.expiry_notified_at) {
      await notificationService.notifyInterviewExpired(assessment.candidate_id, application.job_id, assessment.id);
      const candidate = await Candidate.findByPk(assessment.candidate_id);
      const job = await Job.findByPk(application.job_id);
      const company = job?.company_id ? await CompanyProfile.findByPk(job.company_id) : null;
      await this.sendSystemInterviewMessage({
        companyUserId: company?.user_id,
        candidateUserId: candidate?.user_id,
        jobId: application.job_id,
        applicationId: application.id,
        content: `Your behavior assessment${job?.title ? ` for "${job.title}"` : ''} has expired. Contact the hiring team if you need a reissued assessment.`,
      });
      await ApplicationHistory.create({
        id: randomUUID(),
        application_id: assessment.application_id,
        from_status: application.status,
        to_status: application.status,
        changed_by: assessment.assigned_by,
        note: 'Behavior assessment expired',
      });
      await assessment.update({ expiry_notified_at: now, updated_at: now });
    }

    return true;
  }

  private async autoSubmitIfTimedOut(assessment: InterviewAssessment): Promise<boolean> {
    if (assessment.status !== 'in_progress' || !assessment.started_at) return false;
    const now = Date.now();
    const startedMs = new Date(assessment.started_at).getTime();
    const timerMs = assessment.duration_minutes * 60 * 1000;
    if (now - startedMs < timerMs) return false;

    const attempt = await InterviewAttempt.findOne({ where: { assessment_id: assessment.id } });
    if (!attempt || attempt.status !== 'in_progress') return false;
    await this.finalizeSubmission(assessment, attempt, true);
    return true;
  }

  private async finalizeSubmission(assessment: InterviewAssessment, attempt: InterviewAttempt, autoSubmitted: boolean) {
    const now = new Date();
    const questions = await InterviewQuestion.findAll({
      where: { assessment_id: assessment.id },
      order: [['order_index', 'ASC']],
    });
    const answers = await InterviewAnswer.findAll({ where: { attempt_id: attempt.id } });
    const answerMap = new Map(answers.map((a) => [a.question_id, a]));

    const answerRows = questions.map((q) => {
      const weight = q.weight || 10;
      const selected = answerMap.get(q.id)?.selected_option || null;
      const isCorrect = selected !== null && selected === q.correct_option;

      return {
        question: q.question_text,
        options: q.options || [],
        correctOption: q.correct_option,
        selectedOption: selected,
        isCorrect,
        competencyTag: q.competency_tag || 'behavior',
        weight,
      };
    });

    const { overallScore, dimensionScores } = scoreInterviewAnswers(answerRows);

    let strengths = Object.entries(dimensionScores)
      .filter(([, score]) => score >= 70)
      .map(([name, score]) => `${name}: ${score}/100`);
    let concerns = Object.entries(dimensionScores)
      .filter(([, score]) => score < 60)
      .map(([name, score]) => `${name}: ${score}/100`);
    let recommendation = overallScore >= 75
      ? 'Strong behavioral alignment for this role.'
      : overallScore >= 55
      ? 'Moderate behavioral alignment; follow-up interview recommended.'
      : 'Behavioral fit appears limited; proceed with caution.';

    const application = await Application.findByPk(assessment.application_id, {
      include: [{ model: Job, as: 'job' }],
    }) as (Application & { job?: Job }) | null;
    const candidate = await Candidate.findByPk(assessment.candidate_id);

    try {
      const evaluator: any = qwenService as any;
      if (typeof evaluator.evaluateInterviewAssessment === 'function' && candidate && application?.job) {
        const aiResult = await evaluator.evaluateInterviewAssessment({
          jobTitle: application.job.title,
          jobDescription: application.job.description,
          candidateName: candidate.name,
          answers: answerRows,
          score: overallScore,
          dimensionScores,
        });
        strengths = Array.isArray(aiResult?.strengths) && aiResult.strengths.length > 0 ? aiResult.strengths : strengths;
        concerns = Array.isArray(aiResult?.concerns) && aiResult.concerns.length > 0 ? aiResult.concerns : concerns;
        recommendation = aiResult?.recommendation || recommendation;
      }
    } catch (error) {
      console.warn('Interview report AI evaluation failed, using deterministic fallback:', error);
    }

    await attempt.update({
      status: 'submitted',
      submitted_at: now,
      auto_submitted: autoSubmitted,
      remaining_seconds_snapshot: 0,
      updated_at: now,
    });

    await assessment.update({
      status: 'submitted',
      submitted_at: now,
      auto_submitted: autoSubmitted,
      is_active: false,
      updated_at: now,
    });

    const existingReport = await InterviewReport.findOne({ where: { attempt_id: attempt.id } });
    if (existingReport) {
      await existingReport.update({
        overall_score: overallScore,
        dimension_scores: dimensionScores,
        strengths,
        concerns,
        recommendation,
        raw_llm_output: { answerRows, generatedWithFallback: false },
        generated_at: now,
      });
    } else {
      await InterviewReport.create({
        id: randomUUID(),
        attempt_id: attempt.id,
        overall_score: overallScore,
        dimension_scores: dimensionScores,
        strengths,
        concerns,
        recommendation,
        raw_llm_output: { answerRows, generatedWithFallback: false },
        generated_at: now,
      });
    }

    if (application) {
      await ApplicationHistory.create({
        id: randomUUID(),
        application_id: assessment.application_id,
        from_status: application.status,
        to_status: application.status,
        changed_by: assessment.assigned_by,
        note: autoSubmitted ? 'Behavior assessment auto-submitted on timeout' : 'Behavior assessment submitted by candidate',
      });
      await notificationService.notifyInterviewReportReady(assessment.candidate_id, application.job_id, assessment.id, overallScore);
    }
  }

  private async generateAssessmentQuestions(job: Job, candidate: Candidate) {
    const fallback = this.buildDeterministicFallbackQuestions(job);

    try {
      const generator: any = qwenService as any;
      if (typeof generator.generateBehavioralMcqAssessment !== 'function') {
        return fallback;
      }

      const generated = await generator.generateBehavioralMcqAssessment({
        candidateName: candidate.name,
        candidateHeadline: candidate.headline,
        jobTitle: job.title,
        jobDescription: job.description,
        mustHaveSkills: job.must_have_skills || [],
        niceToHaveSkills: job.nice_to_have_skills || [],
        questionCount: 10,
      });

      if (!Array.isArray(generated?.questions) || generated.questions.length === 0) {
        return fallback;
      }

      return generated.questions.slice(0, 10).map((q: any, index: number) => ({
        question: q.question || fallback[index]?.question || `Behavioral question ${index + 1}`,
        options: Array.isArray(q.options) && q.options.length >= 2 ? q.options.slice(0, 4) : fallback[index]?.options || [],
        correctOption: typeof q.correctOption === 'string' ? q.correctOption : (fallback[index]?.correctOption || 'A'),
        competencyTag: q.competencyTag || 'behavior',
        weight: Number.isFinite(q.weight) ? Math.max(1, Math.min(20, Math.round(q.weight))) : 10,
      }));
    } catch (error) {
      console.warn('Behavior assessment generation failed, using fallback questions:', error);
      return fallback;
    }
  }

  private buildDeterministicFallbackQuestions(job: Job) {
    const title = job.title || 'the role';
    const skillA = (job.must_have_skills || [])[0] || 'problem solving';
    const skillB = (job.must_have_skills || [])[1] || 'communication';

    return [
      {
        question: `A teammate disagrees with your approach on a critical ${title} task. What is your best first response?`,
        options: [
          'Ignore the feedback and continue',
          'Escalate immediately without discussing',
          'Understand concerns and align on objective criteria',
          'Switch approach without discussion',
        ],
        correctOption: 'Understand concerns and align on objective criteria',
        competencyTag: 'collaboration',
        weight: 10,
      },
      {
        question: `You receive unclear requirements for a ${skillA}-related feature. What should you do first?`,
        options: [
          'Start coding to save time',
          'Clarify requirements and confirm expected outcome',
          'Wait until someone notices delays',
          'Copy an old implementation',
        ],
        correctOption: 'Clarify requirements and confirm expected outcome',
        competencyTag: 'ownership',
        weight: 10,
      },
      {
        question: 'A deadline is at risk. Which behavior demonstrates strong accountability?',
        options: [
          'Hide the risk and keep working',
          'Share risk early with options and tradeoffs',
          'Blame another team',
          'Drop quality checks silently',
        ],
        correctOption: 'Share risk early with options and tradeoffs',
        competencyTag: 'accountability',
        weight: 10,
      },
      {
        question: `During a review, your ${skillB} style is flagged as too vague. What is the best adjustment?`,
        options: [
          'Provide concise updates with context, impact, and next steps',
          'Send fewer updates',
          'Only communicate when asked',
          'Use broad statements to stay flexible',
        ],
        correctOption: 'Provide concise updates with context, impact, and next steps',
        competencyTag: 'communication',
        weight: 10,
      },
      {
        question: 'You made a mistake that affected users. What is the best response?',
        options: [
          'Avoid mentioning it',
          'Own it, mitigate impact, and document prevention steps',
          'Wait for someone else to fix it',
          'Delete traces of the mistake',
        ],
        correctOption: 'Own it, mitigate impact, and document prevention steps',
        competencyTag: 'ownership',
        weight: 10,
      },
      {
        question: 'A colleague asks for help while you are busy. What is the most effective behavior?',
        options: [
          'Decline without alternatives',
          'Offer a short focused slot or point to helpful resources',
          'Ignore the request',
          'Take over their task completely',
        ],
        correctOption: 'Offer a short focused slot or point to helpful resources',
        competencyTag: 'teamwork',
        weight: 10,
      },
      {
        question: 'How should you approach feedback that you disagree with?',
        options: [
          'Reject it immediately',
          'Listen, ask clarifying questions, and evaluate evidence',
          'Complain to peers only',
          'Accept blindly without thinking',
        ],
        correctOption: 'Listen, ask clarifying questions, and evaluate evidence',
        competencyTag: 'growth_mindset',
        weight: 10,
      },
      {
        question: 'A process seems inefficient. What is the strongest behavioral response?',
        options: [
          'Ignore it because it is not your job',
          'Propose a small measurable improvement and gather feedback',
          'Complain repeatedly',
          'Change process without alignment',
        ],
        correctOption: 'Propose a small measurable improvement and gather feedback',
        competencyTag: 'initiative',
        weight: 10,
      },
      {
        question: 'Conflict arises between quality and speed. What best reflects mature judgment?',
        options: [
          'Always prioritize speed',
          'Always prioritize perfection',
          'Balance risk, impact, and deadlines with stakeholders',
          'Let others decide and disengage',
        ],
        correctOption: 'Balance risk, impact, and deadlines with stakeholders',
        competencyTag: 'decision_making',
        weight: 10,
      },
      {
        question: 'Which behavior best supports an inclusive team environment?',
        options: [
          'Only work with familiar teammates',
          'Encourage diverse perspectives and respectful discussion',
          'Dismiss different working styles',
          'Avoid team retrospectives',
        ],
        correctOption: 'Encourage diverse perspectives and respectful discussion',
        competencyTag: 'inclusivity',
        weight: 10,
      },
    ];
  }

  private async sendSystemInterviewMessage(params: {
    companyUserId?: string | null;
    candidateUserId?: string | null;
    jobId: string;
    applicationId: string;
    content: string;
  }) {
    if (!params.companyUserId || !params.candidateUserId || !params.content.trim()) return;

    let conversation = await Conversation.findOne({
      where: {
        participant_1_id: params.companyUserId,
        participant_2_id: params.candidateUserId,
        job_id: params.jobId,
      },
    });

    if (!conversation) {
      conversation = await Conversation.create({
        id: randomUUID(),
        participant_1_id: params.companyUserId,
        participant_2_id: params.candidateUserId,
        job_id: params.jobId,
        application_id: params.applicationId,
        last_message_at: new Date(),
      });
    }

    await Message.create({
      id: randomUUID(),
      conversation_id: conversation.id,
      sender_id: params.companyUserId,
      content: params.content.trim(),
      read: false,
    });

    await conversation.update({ last_message_at: new Date() });
  }
}

export const interviewController = new InterviewController();
