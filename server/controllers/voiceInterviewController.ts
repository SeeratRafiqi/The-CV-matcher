import { Response } from 'express';
import { randomUUID } from 'crypto';
import { Op, DataTypes } from 'sequelize';
import sequelize from '../db/config.js';
import {
  Application,
  Candidate,
  CvFile,
  Job,
  VoiceInterviewSession,
} from '../db/models/index.js';
import type { AuthRequest } from '../middleware/auth.js';
import { qwenService, type InterviewState } from '../services/qwen.js';
import { pdfParserService } from '../services/pdfParser.js';
import { synthesizeSpeech, isAlibabaSpeechAvailable } from '../services/alibabaSpeech.js';

const VOICE_INTERVIEW_EXPIRY_HOURS = 72;
/** Once started, candidate must complete within this many minutes. */
const VOICE_INTERVIEW_DURATION_MINUTES = 10;

/** Filter to only substantive interview Q&A; exclude greeting, small talk, and technical-issue lines. */
function filterToInterviewQa(
  questions: { question: string; order: number }[],
  answers: { questionIndex: number; answerText: string; answeredAt: string }[]
): { questionTexts: string[]; answerTexts: string[] } {
  const questionTexts: string[] = [];
  const answerTexts: string[] = [];
  const smallTalkPattern = /^(no worries|take your time|how are you|hi\b|hello\b|thanks|thank you|great to have you|glad you could|sure\b|ok\b|okay\b|sounds good|let'?s begin|let'?s start|are you ready|any questions before we begin|perfect\b|alright\b)/i;
  for (let i = 0; i < questions.length; i++) {
    const q = (questions[i]?.question || '').trim();
    const a = (answers[i]?.answerText || '').trim();
    if (q.length < 25) continue;
    if (smallTalkPattern.test(q)) continue;
    questionTexts.push(q);
    answerTexts.push(a);
  }
  return { questionTexts, answerTexts };
}

/** True if the answer represents silence / no response (for "Are you there?" reply). */
function isSilenceAnswer(text: string): boolean {
  const t = (text || '').trim().toLowerCase();
  if (!t) return true;
  if (/^\(no response\)$|^\(no answer provided\)$|^\[silence\]$/.test(t)) return true;
  return false;
}

/** True if text is a silence-check marker from the client (8s or 15s no speech). */
function isSilenceCheckMarker(text: string): boolean {
  const t = (text || '').trim().toLowerCase();
  return /^\(silence 8s\)$|^\(silence 15s\)$/.test(t);
}

/** Localized "Just checking — can you hear me?" for 8s silence. */
function getSilenceCheck8sMessage(preferredLanguage: string): string {
  const lang = (preferredLanguage || 'en').split('-')[0];
  const messages: Record<string, string> = {
    en: 'Just checking — can you hear me?',
    ar: 'فقط أتأكد — هل تسمعني؟',
    es: 'Solo comprobando — ¿me oyes?',
    fr: 'Juste pour vérifier — vous m\'entendez ?',
    de: 'Nur zur Kontrolle — hören Sie mich?',
    zh: '只是确认一下——你能听到我吗？',
    ja: '確認です——聞こえていますか？',
    hi: 'बस जाँच — क्या आप मुझे सुन सकते हैं?',
    pt: 'Só verificando — consegue me ouvir?',
    ko: '확인해요 — 들리시나요?',
  };
  return messages[lang] ?? messages.en;
}

/** Localized "Are you still there?" for 15s silence. */
function getSilenceCheck15sMessage(preferredLanguage: string): string {
  const lang = (preferredLanguage || 'en').split('-')[0];
  const messages: Record<string, string> = {
    en: 'Are you still there?',
    ar: 'هل ما زلت هناك؟',
    es: '¿Sigues ahí?',
    fr: 'Êtes-vous toujours là ?',
    de: 'Sind Sie noch da?',
    zh: '你还在吗？',
    ja: 'まだいますか？',
    hi: 'क्या आप अभी भी वहाँ हैं?',
    pt: 'Ainda está aí?',
    ko: '아직 계세요?',
  };
  return messages[lang] ?? messages.en;
}

/** Localized "Are you there?" for real-time silence check. */
function getAreYouThereMessage(preferredLanguage: string): string {
  const lang = (preferredLanguage || 'en').split('-')[0];
  const messages: Record<string, string> = {
    en: 'Are you there? If you can hear me, please say something or type in the chat.',
    ar: 'هل أنت هنا؟ إذا كنت تسمعني، يرجى قول شيء أو الكتابة.',
    es: '¿Estás ahí? Si me escuchas, por favor di algo o escribe en el chat.',
    fr: 'Êtes-vous là ? Si vous m\'entendez, dites quelque chose ou écrivez dans le chat.',
    de: 'Sind Sie da? Wenn Sie mich hören, sagen Sie bitte etwas oder tippen Sie.',
    zh: '你还在吗？如果你能听到我，请说点什么或在聊天中打字。',
    ja: '聞こえますか？聞こえたら何か話すかチャットに打ってください。',
    hi: 'क्या आप वहाँ हैं? अगर सुन सकते हैं तो कुछ बोलें या चैट में टाइप करें।',
    pt: 'Você está aí? Se me ouve, por favor diga algo ou digite no chat.',
    ko: '계세요? 들리시면 말씀하시거나 채팅에 입력해 주세요.',
  };
  return messages[lang] ?? messages.en;
}

/** True if the candidate is reporting mic/tech issues (offer reschedule). */
function isTechnicalIssue(text: string): boolean {
  const t = (text || '').trim().toLowerCase();
  const phrases = [
    'mic not working', 'microphone not working', 'can\'t hear', 'cannot hear',
    'no sound', 'audio not working', 'mic is not', 'microphone is not',
    'can\'t use my mic', 'cannot use my mic', 'mic doesn\'t work', 'audio doesn\'t',
    'reschedule', 'technical issue', 'technical problem', 'connection problem',
    'my mic', 'my microphone', 'audio problem', 'sound problem', 'not working',
  ];
  return phrases.some((p) => t.includes(p));
}

/** True if the candidate accepted reschedule (end call). */
function userConfirmedReschedule(text: string): boolean {
  const t = (text || '').trim().toLowerCase();
  const yesPhrases = ['yes', 'yeah', 'yep', 'sure', 'please', 'ok', 'okay', 'reschedule', 'confirm', 'agreed', 'fine'];
  return yesPhrases.some((p) => t.includes(p)) || /^y(eah?|es)?$/i.test(t) || /^ok(ay)?$/i.test(t);
}

/** Localized reschedule offer. */
function getRescheduleOfferMessage(preferredLanguage: string): string {
  const lang = (preferredLanguage || 'en').split('-')[0];
  const messages: Record<string, string> = {
    en: 'It sounds like we\'re having technical issues. Would you like to reschedule? Please say yes to confirm and we\'ll end the call.',
    ar: 'يبدو أننا نواجه مشاكل تقنية. هل ترغب في إعادة الجدولة؟ قل نعم للتأكيد وسننهي المكالمة.',
    es: 'Parece que hay problemas técnicos. ¿Le gustaría reprogramar? Diga sí para confirmar y terminaremos la llamada.',
    fr: 'Il semble que nous ayons des problèmes techniques. Souhaitez-vous reporter ? Dites oui pour confirmer et nous terminerons l\'appel.',
    de: 'Es klingt nach technischen Problemen. Möchten Sie neu planen? Bitte sagen Sie Ja zur Bestätigung, dann beenden wir den Anruf.',
    zh: '听起来我们遇到了技术问题。您想改期吗？请说“是”确认，我们将结束通话。',
    ja: '技術的な問題が発生しているようです。再スケジュールしますか？「はい」と言っていただければ通話を終了します。',
    hi: 'लगता है तकनीकी समस्या हो रही है। क्या आप पुनर्निर्धारण करना चाहेंगे? पुष्टि के लिए हाँ कहें और हम कॉल समाप्त कर देंगे।',
    pt: 'Parece que estamos com problemas técnicos. Gostaria de reagendar? Diga sim para confirmar e encerraremos a chamada.',
    ko: '기술적 문제가 있는 것 같습니다. 일정을 변경하시겠습니까? 확인하려면 예라고 하시면 통화를 종료하겠습니다.',
  };
  return messages[lang] ?? messages.en;
}

let outcomeColumnEnsured = false;
async function ensureOutcomeColumn(): Promise<void> {
  if (outcomeColumnEnsured) return;
  try {
    const dialect = sequelize.getDialect();
    if (dialect === 'sqlite') {
      await sequelize.getQueryInterface().addColumn('voice_interview_sessions', 'outcome', {
        type: DataTypes.TEXT,
        allowNull: true,
      });
    } else {
      await sequelize.query('ALTER TABLE voice_interview_sessions ADD COLUMN outcome TEXT NULL');
    }
  } catch (e: any) {
    const msg = e?.message ?? '';
    if (!msg.includes('duplicate') && !msg.includes('already exists')) {
      console.warn('[VoiceInterview] ensure outcome column:', msg.substring(0, 100));
    }
  }
  outcomeColumnEnsured = true;
}

let durationMinutesColumnEnsured = false;
async function ensureDurationMinutesColumn(): Promise<void> {
  if (durationMinutesColumnEnsured) return;
  try {
    const dialect = sequelize.getDialect();
    if (dialect === 'sqlite') {
      await sequelize.getQueryInterface().addColumn('voice_interview_sessions', 'duration_minutes', {
        type: DataTypes.INTEGER,
        allowNull: true,
      });
    } else {
      await sequelize.query('ALTER TABLE voice_interview_sessions ADD COLUMN duration_minutes INT NULL');
    }
  } catch (e: any) {
    const msg = e?.message ?? '';
    if (!msg.includes('duplicate') && !msg.includes('already exists')) {
      console.warn('[VoiceInterview] ensure duration_minutes column:', msg.substring(0, 100));
    }
  }
  durationMinutesColumnEnsured = true;
}

let conductorStateColumnEnsured = false;
async function ensureConductorStateColumn(): Promise<void> {
  if (conductorStateColumnEnsured) return;
  try {
    const dialect = sequelize.getDialect();
    if (dialect === 'sqlite') {
      await sequelize.getQueryInterface().addColumn('voice_interview_sessions', 'conductor_state', {
        type: DataTypes.TEXT,
        allowNull: true,
      });
    } else {
      await sequelize.query('ALTER TABLE voice_interview_sessions ADD COLUMN conductor_state TEXT NULL');
    }
  } catch (e: any) {
    const msg = e?.message ?? '';
    if (!msg.includes('duplicate') && !msg.includes('already exists')) {
      console.warn('[VoiceInterview] ensure conductor_state column:', msg.substring(0, 100));
    }
  }
  conductorStateColumnEnsured = true;
}

/** Number of "turns" for intro (greeting, small talk, context, ready check). */
const INTRO_TURNS = 4;
/** Approximate minutes per Q&A (candidate answer + AI reply + thinking). */
const MINUTES_PER_QUESTION = 2;
/** Min/max interview questions (excluding intro). */
const MIN_INTERVIEW_QUESTIONS = 3;
const MAX_INTERVIEW_QUESTIONS = 12;

/** Compute how many total turns (intro + questions) fit in durationMinutes so the AI asks the right number of questions. */
function maxTurnsFromDuration(durationMinutes: number): number {
  const minutesForIntro = 2;
  const minutesForQa = Math.max(0, durationMinutes - minutesForIntro);
  const questionCount = Math.min(
    MAX_INTERVIEW_QUESTIONS,
    Math.max(MIN_INTERVIEW_QUESTIONS, Math.floor(minutesForQa / MINUTES_PER_QUESTION))
  );
  return INTRO_TURNS + questionCount;
}

type JobWithCompany = Job & { company_id: string };

async function assertCompanyAccess(req: AuthRequest, companyId: string) {
  if (!req.user) throw Object.assign(new Error('Authentication required'), { status: 401 });
  const { CompanyProfile } = await import('../db/models/index.js');
  const company = await CompanyProfile.findOne({ where: { id: companyId, user_id: req.user.id } });
  if (!company) throw Object.assign(new Error('Forbidden'), { status: 403 });
  return company;
}

async function getCandidateCvText(candidateId: string): Promise<string> {
  const cvFile = await CvFile.findOne({
    where: { candidate_id: candidateId },
    order: [['uploaded_at', 'DESC']],
  });
  if (!cvFile?.file_path) return '';
  try {
    return await pdfParserService.extractText(cvFile.file_path);
  } catch {
    return '';
  }
}

export const voiceInterviewController = {
  async assign(req: AuthRequest, res: Response) {
    try {
      await ensureDurationMinutesColumn();
      await ensureConductorStateColumn();
      const { applicationId, durationMinutes } = req.body || {};
      if (!applicationId) return res.status(400).json({ message: 'applicationId is required' });
      const duration = durationMinutes != null ? Math.min(60, Math.max(5, Number(durationMinutes))) : 10;

      const application = await Application.findByPk(applicationId, {
        include: [{ model: Job, as: 'job' }],
      }) as (Application & { job?: JobWithCompany }) | null;
      if (!application) return res.status(404).json({ message: 'Application not found' });
      const job = application.job;
      if (!job) return res.status(404).json({ message: 'Job not found' });

      await assertCompanyAccess(req, job.company_id);

      const allowedStatuses = ['applied', 'screening', 'interview'];
      if (!allowedStatuses.includes(application.status)) {
        return res.status(400).json({
          message: 'Voice interview can only be assigned when application is applied, in screening, or in interview stage.',
        });
      }

      const existing = await VoiceInterviewSession.findOne({
        where: { application_id: applicationId, status: { [Op.in]: ['assigned', 'in_progress'] } },
      });
      if (existing) {
        return res.status(409).json({ message: 'A voice interview is already assigned for this application.' });
      }

      const maxTurns = maxTurnsFromDuration(duration);
      const expiresAt = new Date(Date.now() + VOICE_INTERVIEW_EXPIRY_HOURS * 60 * 60 * 1000);
      const session = await VoiceInterviewSession.create({
        id: randomUUID(),
        application_id: applicationId,
        candidate_id: application.candidate_id,
        job_id: application.job_id,
        status: 'assigned',
        questions: '[]',
        answers: '[]',
        current_question_index: 0,
        max_questions: maxTurns,
        duration_minutes: duration,
        expires_at: expiresAt,
      });

      const n8nWebhook = process.env.N8N_VOICE_INTERVIEW_ASSIGNED_WEBHOOK_URL;
      if (n8nWebhook) {
        try {
          await fetch(n8nWebhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: session.id,
              applicationId,
              jobId: application.job_id,
              candidateId: application.candidate_id,
              expiresAt: expiresAt.toISOString(),
            }),
          });
        } catch (_) {
          /* ignore webhook failure */
        }
      }

      return res.status(201).json({
        message: 'Voice interview assigned',
        session: {
          id: session.id,
          applicationId: session.application_id,
          jobId: session.job_id,
          status: session.status,
          maxQuestions: session.max_questions,
          expiresAt: session.expires_at,
        },
      });
    } catch (e: any) {
      console.error('[VoiceInterview] assign failed:', e?.message);
      const status = (e as any)?.status ?? 500;
      return res.status(status).json({ message: e?.message ?? 'Failed to assign voice interview' });
    }
  },

  /**
   * Create a test voice interview session so you can open the interview without going through job/apply/assign.
   * Uses the first available job and creates an application if needed. For testing only.
   */
  async createTestSession(req: AuthRequest, res: Response) {
    try {
      await ensureDurationMinutesColumn();
      await ensureConductorStateColumn();
      if (!req.user) return res.status(401).json({ message: 'Authentication required' });
      const candidate = await Candidate.findOne({ where: { user_id: req.user.id } });
      if (!candidate) return res.status(404).json({ message: 'Candidate not found' });

      const duration = 10;
      const maxTurns = maxTurnsFromDuration(duration);
      const expiresAt = new Date(Date.now() + VOICE_INTERVIEW_EXPIRY_HOURS * 60 * 60 * 1000);

      const job = await Job.findOne({
        where: { status: 'published' },
        order: [['created_at', 'DESC']],
        limit: 1,
      });
      if (!job) return res.status(400).json({ message: 'No job found. Create at least one published job first.' });

      let application = await Application.findOne({
        where: { candidate_id: candidate.id, job_id: job.id },
      });
      if (!application) {
        application = await Application.create({
          candidate_id: candidate.id,
          job_id: job.id,
          status: 'applied',
        } as any);
      }

      const existing = await VoiceInterviewSession.findOne({
        where: { application_id: application.id, status: { [Op.in]: ['assigned', 'in_progress'] } },
      });
      if (existing) {
        return res.status(200).json({
          message: 'Test session already exists',
          sessionId: existing.id,
          url: `/candidate/voice-interviews/${existing.id}`,
        });
      }

      const session = await VoiceInterviewSession.create({
        id: randomUUID(),
        application_id: application.id,
        candidate_id: candidate.id,
        job_id: job.id,
        status: 'assigned',
        questions: '[]',
        answers: '[]',
        current_question_index: 0,
        max_questions: maxTurns,
        duration_minutes: duration,
        expires_at: expiresAt,
      });

      return res.status(201).json({
        message: 'Test voice interview session created',
        sessionId: session.id,
        url: `/candidate/voice-interviews/${session.id}`,
      });
    } catch (e: any) {
      console.error('[VoiceInterview] createTestSession failed:', e?.message);
      return res.status(500).json({ message: e?.message ?? 'Failed to create test session' });
    }
  },

  async getForApplication(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ message: 'Authentication required' });
      const candidate = await Candidate.findOne({ where: { user_id: req.user.id } });
      if (!candidate) return res.status(404).json({ message: 'Candidate not found' });

      const { applicationId } = req.params;
      const application = await Application.findOne({
        where: { id: applicationId, candidate_id: candidate.id },
        attributes: ['id'],
      });
      if (!application) return res.status(404).json({ message: 'Application not found' });

      const session = await VoiceInterviewSession.findOne({
        where: { application_id: applicationId },
        include: [{ model: Job, as: 'job', attributes: ['id', 'title'], required: false }],
      });
      if (!session) return res.json({ session: null });

      const now = new Date();
      const expired = new Date(session.expires_at) < now;
      const status = expired && session.status !== 'completed' ? 'expired' : session.status;

      return res.json({
        session: {
          id: session.id,
          jobId: session.job_id,
          jobTitle: (session as any).job?.title ?? 'Job',
          status,
          currentQuestionIndex: session.current_question_index,
          maxQuestions: session.max_questions,
          expiresAt: session.expires_at,
          completedAt: session.completed_at,
        },
      });
    } catch (e: any) {
      console.error('[VoiceInterview] getForApplication failed:', e?.message);
      return res.status(500).json({ message: e?.message ?? 'Failed to load session' });
    }
  },

  async getMySessions(req: AuthRequest, res: Response) {
    try {
      await ensureOutcomeColumn();
      if (!req.user) return res.status(401).json({ message: 'Authentication required' });
      const candidate = await Candidate.findOne({ where: { user_id: req.user.id } });
      if (!candidate) return res.json({ sessions: [] });

      const now = new Date();
      // Find all sessions for this candidate (by candidate_id only so it works as soon as recruiter assigns)
      const sessions = await VoiceInterviewSession.findAll({
        where: { candidate_id: candidate.id },
        attributes: ['id', 'job_id', 'application_id', 'status', 'current_question_index', 'max_questions', 'expires_at', 'completed_at'],
        order: [['created_at', 'DESC']],
      });

      const jobIds = [...new Set(sessions.map((s) => s.job_id).filter(Boolean))] as string[];
      const jobs = jobIds.length > 0 ? await Job.findAll({ where: { id: { [Op.in]: jobIds } }, attributes: ['id', 'title'] }) : [];
      const jobMap = new Map(jobs.map((j) => [j.id, j.title]));

      const list = sessions.map((s) => {
        const expired = new Date(s.expires_at) < now;
        return {
          id: s.id,
          jobId: s.job_id,
          jobTitle: jobMap.get(s.job_id) ?? 'Job',
          status: expired && s.status !== 'completed' ? 'expired' : s.status,
          currentQuestionIndex: s.current_question_index,
          maxQuestions: s.max_questions,
          expiresAt: s.expires_at,
          completedAt: s.completed_at,
        };
      });

      return res.json({ sessions: list });
    } catch (e: any) {
      console.error('[VoiceInterview] getMySessions failed:', e?.message);
      return res.status(500).json({ message: e?.message ?? 'Failed to load sessions' });
    }
  },

  async getSession(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ message: 'Authentication required' });
      const candidate = await Candidate.findOne({ where: { user_id: req.user.id } });
      if (!candidate) return res.status(404).json({ message: 'Candidate not found' });

      const { id } = req.params;
      const myAppIds = (await Application.findAll({ where: { candidate_id: candidate.id }, attributes: ['id'] })).map((a) => a.id);
      const sessionWhere =
        myAppIds.length > 0
          ? { id, [Op.or]: [{ application_id: { [Op.in]: myAppIds } }, { candidate_id: candidate.id }] }
          : { id, candidate_id: candidate.id };
      const session = await VoiceInterviewSession.findOne({
        where: sessionWhere,
        include: [{ model: Job, as: 'job', attributes: ['id', 'title'], required: false }],
      });
      if (!session) return res.status(404).json({ message: 'Session not found' });

      const now = new Date();
      const expired = new Date(session.expires_at) < now;
      const startedAt = session.started_at ? new Date(session.started_at) : null;
      const durationMins = (session as any).duration_minutes ?? VOICE_INTERVIEW_DURATION_MINUTES;
      const durationMs = durationMins * 60 * 1000;
      const timeLimitExceeded =
        session.status === 'in_progress' &&
        startedAt &&
        now.getTime() - startedAt.getTime() > durationMs;
      if (timeLimitExceeded) {
        await session.update({ status: 'expired', updated_at: new Date() });
      }
      if (expired && session.status !== 'completed') {
        await session.update({ status: 'expired', updated_at: new Date() });
      }

      let questions: { question: string; order: number }[] = [];
      try {
        questions = JSON.parse(session.questions || '[]');
      } catch {}

      let currentQuestion: { question: string; order: number } | null = null;
      if (session.status === 'in_progress' || session.status === 'completed') {
        try {
          const conductorState = JSON.parse((session as any).conductor_state || '{}');
          const history = conductorState.conversationHistory as { role: string; content: string }[] | undefined;
          if (Array.isArray(history) && history.length > 0) {
            for (let i = history.length - 1; i >= 0; i--) {
              if (history[i]?.role === 'assistant' && history[i]?.content) {
                currentQuestion = { question: history[i].content, order: session.current_question_index };
                break;
              }
            }
          }
        } catch {}
        if (!currentQuestion) {
          currentQuestion = questions[session.current_question_index] ?? null;
        }
      }

      const effectiveStatus =
        timeLimitExceeded ? 'expired' : expired && session.status !== 'completed' ? 'expired' : session.status;
      const endsAt =
        session.status === 'in_progress' && startedAt
          ? new Date(startedAt.getTime() + durationMs).toISOString()
          : null;

      let preferredLanguage = 'en';
      try {
        const conductorState = JSON.parse((session as any).conductor_state || '{}');
        preferredLanguage = conductorState.preferredLanguage || 'en';
      } catch {}

      return res.json({
        session: {
          id: session.id,
          jobId: session.job_id,
          jobTitle: (session as any).job?.title ?? 'Job',
          status: effectiveStatus,
          currentQuestionIndex: session.current_question_index,
          maxQuestions: session.max_questions,
          currentQuestion: currentQuestion?.question ?? null,
          questionsCount: questions.length,
          expiresAt: session.expires_at,
          completedAt: session.completed_at,
          startedAt: session.started_at ?? null,
          endsAt,
          preferredLanguage,
        },
      });
    } catch (e: any) {
      console.error('[VoiceInterview] getSession failed:', e?.message);
      return res.status(500).json({ message: e?.message ?? 'Failed to load session' });
    }
  },

  async getReport(req: AuthRequest, res: Response) {
    try {
      await ensureOutcomeColumn();
      if (!req.user) return res.status(401).json({ message: 'Authentication required' });
      const candidate = await Candidate.findOne({ where: { user_id: req.user.id } });
      if (!candidate) return res.status(404).json({ message: 'Candidate not found' });

      const myAppIds = (await Application.findAll({ where: { candidate_id: candidate.id }, attributes: ['id'] })).map((a) => a.id);

      const { id } = req.params;
      const reportSessionWhere =
        myAppIds.length > 0
          ? { id, [Op.or]: [{ application_id: { [Op.in]: myAppIds } }, { candidate_id: candidate.id }] }
          : { id, candidate_id: candidate.id };
      const session = await VoiceInterviewSession.findOne({
        where: reportSessionWhere,
        include: [{ model: Job, as: 'job', attributes: ['id', 'title'], required: false }],
      });
      if (!session) return res.status(404).json({ message: 'Session not found' });

      let questions: { question: string; order: number }[] = [];
      let answers: { questionIndex: number; answerText: string; answeredAt: string }[] = [];
      try {
        questions = JSON.parse(session.questions || '[]');
        answers = JSON.parse(session.answers || '[]');
      } catch {}

      const qa = questions.map((q, i) => ({
        question: q.question,
        answer: answers[i]?.answerText ?? '',
        answeredAt: answers[i]?.answeredAt ?? null,
      }));

      let outcome = session.outcome ?? null;
      if (session.status === 'completed' && (!outcome || !String(outcome).trim())) {
        const { questionTexts, answerTexts } = filterToInterviewQa(questions, answers);
        if (questionTexts.length > 0) {
          try {
            const jobTitle = (session as any).job?.title ?? 'Job';
            const { outcome: generated } = await qwenService.generateVoiceInterviewOutcome({
              jobTitle,
              questions: questionTexts,
              answers: answerTexts,
            });
            if (generated?.trim()) {
              outcome = generated;
              await session.update({ outcome: generated });
            }
          } catch (err: any) {
            console.error('[VoiceInterview] lazy outcome generation (getReport) failed:', err?.message ?? err);
          }
        }
      }

      return res.json({
        report: {
          id: session.id,
          jobId: session.job_id,
          jobTitle: (session as any).job?.title ?? 'Job',
          status: session.status,
          completedAt: session.completed_at,
          outcome,
          qa,
        },
      });
    } catch (e: any) {
      console.error('[VoiceInterview] getReport failed:', e?.message);
      return res.status(500).json({ message: e?.message ?? 'Failed to load report' });
    }
  },

  async start(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ message: 'Authentication required' });
      const candidate = await Candidate.findOne({ where: { user_id: req.user.id } });
      if (!candidate) return res.status(404).json({ message: 'Candidate not found' });

      const myAppIds = (await Application.findAll({ where: { candidate_id: candidate.id }, attributes: ['id'] })).map((a) => a.id);

      const { id } = req.params;
      const startSessionWhere =
        myAppIds.length > 0
          ? { id, [Op.or]: [{ application_id: { [Op.in]: myAppIds } }, { candidate_id: candidate.id }] }
          : { id, candidate_id: candidate.id };
      const session = await VoiceInterviewSession.findOne({
        where: startSessionWhere,
        include: [{ model: Job, as: 'job' }],
      });
      if (!session) return res.status(404).json({ message: 'Session not found' });

      if (new Date(session.expires_at) < new Date()) {
        await session.update({ status: 'expired' });
        return res.status(400).json({ message: 'This voice interview has expired.' });
      }
      if (session.status === 'completed') {
        return res.status(400).json({ message: 'This voice interview is already completed.' });
      }

      const job = (session as any).job as Job & { description?: string; must_have_skills?: string[]; nice_to_have_skills?: string[] };
      const jobTitle = job?.title ?? 'Role';
      const jobDescription = job?.description ?? '';
      const jobSkills = [...(job?.must_have_skills ?? []), ...(job?.nice_to_have_skills ?? [])];
      const candidateContext = await getCandidateCvText(candidate.id);
      const candidateName = (candidate as any).name ?? 'there';
      const preferredLanguage = (req.body as any)?.preferredLanguage || 'en';

      // State-machine conductor: pre-generate questions based on time constraint (intro + N questions)
      const numInterviewQuestions = Math.max(MIN_INTERVIEW_QUESTIONS, session.max_questions - INTRO_TURNS);
      const conductorQuestions = await qwenService.generateConductorQuestions({
        jobTitle,
        jobDescription,
        jobSkills,
        candidateContext: candidateContext ? candidateContext.substring(0, 2000) : undefined,
        count: numInterviewQuestions,
        preferredLanguage,
      });
      const initialState: InterviewState = {
        phase: 'greeting',
        questionIndex: 0,
        smallTalkTurns: 0,
        conversationHistory: [],
        questions: conductorQuestions,
        candidateName,
        jobTitle,
        interviewerName: 'Aria',
        preferredLanguage,
      };

      const { response, updatedState } = await qwenService.startInterview(initialState);

      const questionsForSession = [{ question: response, order: 0 }];
      const maxTurns = INTRO_TURNS + conductorQuestions.length; // greeting + small_talk + context + ready + N questions
      await session.update({
        status: 'in_progress',
        started_at: new Date(),
        questions: JSON.stringify(questionsForSession),
        answers: JSON.stringify([]),
        current_question_index: 0,
        conductor_state: JSON.stringify(updatedState),
        updated_at: new Date(),
      });

      return res.json({
        session: {
          id: session.id,
          status: 'in_progress',
          currentQuestionIndex: 0,
          maxQuestions: maxTurns,
          currentQuestion: response,
          preferredLanguage,
        },
      });
    } catch (e: any) {
      console.error('[VoiceInterview] start failed:', e?.message);
      return res.status(500).json({ message: e?.message ?? 'Failed to start voice interview' });
    }
  },

  async submitAnswer(req: AuthRequest, res: Response) {
    try {
      await ensureOutcomeColumn();
      if (!req.user) return res.status(401).json({ message: 'Authentication required' });
      const candidate = await Candidate.findOne({ where: { user_id: req.user.id } });
      if (!candidate) return res.status(404).json({ message: 'Candidate not found' });

      const myAppIds = (await Application.findAll({ where: { candidate_id: candidate.id }, attributes: ['id'] })).map((a) => a.id);

      const { id } = req.params;
      const { answerText, expressionSummary } = req.body || {};
      const answerSessionWhere =
        myAppIds.length > 0
          ? { id, [Op.or]: [{ application_id: { [Op.in]: myAppIds } }, { candidate_id: candidate.id }] }
          : { id, candidate_id: candidate.id };
      const session = await VoiceInterviewSession.findOne({
        where: answerSessionWhere,
        include: [{ model: Job, as: 'job' }],
      });
      if (!session) return res.status(404).json({ message: 'Session not found' });

      if (session.status !== 'in_progress') {
        return res.status(400).json({ message: 'Session is not in progress.' });
      }

      const startedAt = session.started_at ? new Date(session.started_at) : null;
      const durationMins = (session as any).duration_minutes ?? VOICE_INTERVIEW_DURATION_MINUTES;
      const durationMs = durationMins * 60 * 1000;
      if (startedAt && new Date().getTime() - startedAt.getTime() > durationMs) {
        await session.update({ status: 'expired', updated_at: new Date() });
        return res.status(400).json({ message: 'Time limit exceeded. This interview is closed.' });
      }

      let questions: { question: string; order: number }[] = [];
      let answers: { questionIndex: number; answerText: string; answeredAt: string }[] = [];
      try {
        questions = JSON.parse(session.questions || '[]');
        answers = JSON.parse(session.answers || '[]');
      } catch {}

      const text = typeof answerText === 'string' ? answerText.trim() : '';
      const conductorStateRaw = (session as any).conductor_state;

      if (conductorStateRaw) {
        // State-machine conductor flow
        let state: InterviewState;
        try {
          state = JSON.parse(conductorStateRaw) as InterviewState;
        } catch {
          state = null as unknown as InterviewState;
        }
        if (state?.conversationHistory) {
          const lang = state.preferredLanguage || 'en';

          // Silence check markers: 8s → "Just checking — can you hear me?", 15s → "Are you still there?" (do not advance phase)
          if (isSilenceCheckMarker(text)) {
            const is8s = /\(silence 8s\)/i.test(text);
            const message = is8s ? getSilenceCheck8sMessage(lang) : getSilenceCheck15sMessage(lang);
            const updatedState: InterviewState = {
              ...state,
              conversationHistory: [
                ...state.conversationHistory,
                { role: 'user', content: text },
                { role: 'assistant', content: message },
              ],
            };
            await session.update({
              conductor_state: JSON.stringify(updatedState),
              updated_at: new Date(),
            });
            return res.json({
              done: false,
              session: {
                id: session.id,
                currentQuestionIndex: session.current_question_index,
                maxQuestions: session.max_questions,
                currentQuestion: message,
              },
            });
          }

          // Silence / no response → reply "Are you there?" without advancing phase (persist so refetch keeps it)
          if (isSilenceAnswer(text)) {
            const areYouThere = getAreYouThereMessage(lang);
            const updatedState: InterviewState = {
              ...state,
              conversationHistory: [
                ...state.conversationHistory,
                { role: 'user', content: '(No response)' },
                { role: 'assistant', content: areYouThere },
              ],
            };
            await session.update({
              conductor_state: JSON.stringify(updatedState),
              updated_at: new Date(),
            });
            return res.json({
              done: false,
              session: {
                id: session.id,
                currentQuestionIndex: session.current_question_index,
                maxQuestions: session.max_questions,
                currentQuestion: areYouThere,
              },
            });
          }

          // Reschedule was offered and user confirmed → end call
          if (state.rescheduleOffered && userConfirmedReschedule(text)) {
            await session.update({
              conductor_state: JSON.stringify({ ...state, conversationHistory: [...state.conversationHistory, { role: 'user' as const, content: text }, { role: 'assistant' as const, content: 'We\'ll reschedule. Goodbye.' }] }),
              status: 'completed',
              completed_at: new Date(),
              outcome: 'Candidate requested reschedule due to technical issues. The call was ended by mutual agreement.',
              updated_at: new Date(),
            });
            const goodbyeMsg = lang.startsWith('ar') ? 'سنعيد الجدولة. مع السلامة.' : lang.startsWith('es') ? 'Reagendaremos. Hasta luego.' : 'We\'ll reschedule and be in touch. Goodbye.';
            return res.json({
              done: true,
              message: 'Reschedule confirmed. Goodbye!',
              session: { id: session.id, status: 'completed', currentQuestion: goodbyeMsg },
            });
          }

          // Candidate reports tech issue → offer reschedule (do not advance phase)
          if (!state.rescheduleOffered && isTechnicalIssue(text)) {
            const updatedState: InterviewState = {
              ...state,
              rescheduleOffered: true,
              conversationHistory: [
                ...state.conversationHistory,
                { role: 'user', content: text },
                { role: 'assistant', content: getRescheduleOfferMessage(lang) },
              ],
            };
            await session.update({
              conductor_state: JSON.stringify(updatedState),
              updated_at: new Date(),
            });
            return res.json({
              done: false,
              session: {
                id: session.id,
                currentQuestionIndex: session.current_question_index,
                maxQuestions: session.max_questions,
                currentQuestion: getRescheduleOfferMessage(lang),
              },
            });
          }

          const isInterviewPhase = state.phase === 'interview';
          const currentInterviewQuestion = (state.questions && state.questions[state.questionIndex]);
          if (isInterviewPhase && currentInterviewQuestion) {
            questions.push({ question: currentInterviewQuestion, order: state.questionIndex });
            answers.push({
              questionIndex: state.questionIndex,
              answerText: text || '(No answer provided)',
              answeredAt: new Date().toISOString(),
            });
          }

          const { response: nextLine, updatedState } = await qwenService.conductInterview(state, text || '(No answer provided)');

          const isClosing = updatedState.phase === 'closing';
          const nextIndex = questions.length;

          if (isClosing) {
            const job = (session as any).job as Job & { title?: string };
            const jobTitle = job?.title ?? 'Role';
            let outcome: string | null = null;
            try {
              const { questionTexts, answerTexts } = filterToInterviewQa(questions, answers);
              if (questionTexts.length > 0) {
                const { outcome: generated } = await qwenService.generateVoiceInterviewOutcome({
                  jobTitle,
                  questions: questionTexts,
                  answers: answerTexts,
                  expressionSummary: typeof expressionSummary === 'string' ? expressionSummary : undefined,
                });
                outcome = generated;
              }
            } catch (err) {
              console.error('[VoiceInterview] outcome generation failed:', err);
            }
            await session.update({
              questions: JSON.stringify(questions),
              answers: JSON.stringify(answers),
              current_question_index: nextIndex,
              conductor_state: JSON.stringify(updatedState),
              status: 'completed',
              completed_at: new Date(),
              outcome: outcome ?? undefined,
              updated_at: new Date(),
            });
            return res.json({
              done: true,
              message: 'Voice interview completed. Thank you!',
              session: { id: session.id, status: 'completed', currentQuestion: nextLine, outcome: outcome ?? undefined },
            });
          }

          await session.update({
            questions: JSON.stringify(questions),
            answers: JSON.stringify(answers),
            current_question_index: nextIndex,
            conductor_state: JSON.stringify(updatedState),
            updated_at: new Date(),
          });

          const maxTurns = 4 + (state.questions?.length ?? 0);
          return res.json({
            done: false,
            session: {
              id: session.id,
              currentQuestionIndex: nextIndex,
              maxQuestions: maxTurns,
              currentQuestion: nextLine,
            },
          });
        }
      }

      // Fallback: legacy flow (no conductor_state)
      answers.push({
        questionIndex: session.current_question_index,
        answerText: text || '(No answer provided)',
        answeredAt: new Date().toISOString(),
      });

      const nextIndex = session.current_question_index + 1;
      const isLast = nextIndex >= session.max_questions;

      if (isLast) {
        const job = (session as any).job as Job & { title?: string };
        const jobTitle = job?.title ?? 'Role';
        let outcome: string | null = null;
        try {
          const { questionTexts, answerTexts } = filterToInterviewQa(questions, answers);
          if (questionTexts.length > 0) {
            const { outcome: generated } = await qwenService.generateVoiceInterviewOutcome({
              jobTitle,
              questions: questionTexts,
              answers: answerTexts,
              expressionSummary: typeof expressionSummary === 'string' ? expressionSummary : undefined,
            });
            outcome = generated;
          }
        } catch (err) {
          console.error('[VoiceInterview] outcome generation failed:', err);
        }
        await session.update({
          answers: JSON.stringify(answers),
          current_question_index: nextIndex,
          status: 'completed',
          completed_at: new Date(),
          outcome: outcome ?? undefined,
          updated_at: new Date(),
        });
        return res.json({
          done: true,
          message: 'Voice interview completed. Thank you!',
          session: { id: session.id, status: 'completed', outcome: outcome ?? undefined },
        });
      }

      const job = (session as any).job as Job & { description?: string; must_have_skills?: string[]; nice_to_have_skills?: string[] };
      const jobTitle = job?.title ?? 'Role';
      const jobDescription = job?.description ?? '';
      const jobSkills = [...(job?.must_have_skills ?? []), ...(job?.nice_to_have_skills ?? [])];
      const candidateContext = await getCandidateCvText(candidate.id);
      const previousQAndA = questions.slice(0, nextIndex).map((q, i) => ({
        question: q.question,
        answer: answers[i]?.answerText ?? '',
      }));
      const candidateName = (candidate as any).name ?? undefined;
      const durationMinutes = (session as any).duration_minutes ?? undefined;
      const { question: nextQuestion } = await qwenService.generateVoiceInterviewQuestion({
        jobTitle,
        jobDescription,
        jobSkills,
        candidateContext: candidateContext ? candidateContext.substring(0, 2000) : undefined,
        candidateName,
        previousQAndA,
        questionIndex: nextIndex,
        maxQuestions: session.max_questions,
        durationMinutes,
      });

      questions.push({ question: nextQuestion, order: nextIndex });
      await session.update({
        questions: JSON.stringify(questions),
        answers: JSON.stringify(answers),
        current_question_index: nextIndex,
        updated_at: new Date(),
      });

      return res.json({
        done: false,
        session: {
          id: session.id,
          currentQuestionIndex: nextIndex,
          maxQuestions: session.max_questions,
          currentQuestion: nextQuestion,
        },
      });
    } catch (e: any) {
      console.error('[VoiceInterview] submitAnswer failed:', e?.message);
      return res.status(500).json({ message: e?.message ?? 'Failed to submit answer' });
    }
  },

  /** Recruiter/company: get voice interview report for an application. */
  async getReportForApplication(req: AuthRequest, res: Response) {
    try {
      await ensureOutcomeColumn();
      const { applicationId } = req.params;
      if (!applicationId) return res.status(400).json({ message: 'applicationId is required' });

      const application = await Application.findByPk(applicationId, {
        include: [{ model: Job, as: 'job', attributes: ['id', 'title', 'company_id'] }],
      }) as (Application & { job?: JobWithCompany }) | null;
      if (!application?.job) return res.status(404).json({ message: 'Application or job not found' });
      await assertCompanyAccess(req, application.job.company_id);

      const sessions = await VoiceInterviewSession.findAll({
        where: { application_id: applicationId },
        include: [{ model: Job, as: 'job', attributes: ['id', 'title'], required: false }],
        order: [['created_at', 'DESC']],
        limit: 1,
      });
      const session = sessions[0] ?? null;
      if (!session) return res.status(404).json({ message: 'No voice interview found for this application.' });

      let questions: { question: string; order: number }[] = [];
      let answers: { questionIndex: number; answerText: string; answeredAt: string }[] = [];
      try {
        questions = JSON.parse(session.questions || '[]');
        answers = JSON.parse(session.answers || '[]');
      } catch {}

      const qa = questions.map((q, i) => ({
        question: q.question,
        answer: answers[i]?.answerText ?? '',
        answeredAt: answers[i]?.answeredAt ?? null,
      }));

      let outcome = session.outcome ?? null;
      if (session.status === 'completed' && (!outcome || !String(outcome).trim())) {
        const { questionTexts, answerTexts } = filterToInterviewQa(questions, answers);
        if (questionTexts.length > 0) {
          try {
            const jobTitle = (session as any).job?.title ?? 'Job';
            const { outcome: generated } = await qwenService.generateVoiceInterviewOutcome({
              jobTitle,
              questions: questionTexts,
              answers: answerTexts,
            });
            if (generated?.trim()) {
              outcome = generated;
              await session.update({ outcome: generated });
            }
          } catch (err: any) {
            console.error('[VoiceInterview] lazy outcome generation (getReportForApplication) failed:', err?.message ?? err);
          }
        }
      }

      return res.json({
        report: {
          id: session.id,
          applicationId: applicationId,
          jobId: session.job_id,
          jobTitle: (session as any).job?.title ?? 'Job',
          status: session.status,
          completedAt: session.completed_at,
          outcome,
          qa,
        },
      });
    } catch (e: any) {
      console.error('[VoiceInterview] getReportForApplication failed:', e?.message);
      return res.status(e?.status === 403 ? 403 : 500).json({ message: e?.message ?? 'Failed to load report' });
    }
  },

  /** Speech config: whether Alibaba TTS is available (same key as Qwen). */
  async speechConfig(_req: AuthRequest, res: Response) {
    return res.json({ useAlibabaTTS: isAlibabaSpeechAvailable() });
  },

  /** Alibaba TTS: synthesize interview line. Returns audio/wav. */
  async tts(req: AuthRequest, res: Response) {
    try {
      const { text, languageCode } = (req.body || {}) as { text?: string; languageCode?: string };
      if (!text || typeof text !== 'string') {
        return res.status(400).json({ message: 'text is required' });
      }
      const result = await synthesizeSpeech(text.trim().slice(0, 2000), languageCode || 'en');
      if (!result) {
        return res.status(503).json({ message: 'TTS not available or failed. Use browser speech as fallback.' });
      }
      res.setHeader('Content-Type', result.mimeType);
      res.setHeader('Cache-Control', 'no-store');
      return res.send(result.audioBuffer);
    } catch (e: any) {
      console.error('[VoiceInterview] TTS failed:', e?.message);
      return res.status(500).json({ message: e?.message ?? 'TTS failed' });
    }
  },
};
