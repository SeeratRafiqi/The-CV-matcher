import { Router } from 'express';
import { aiController } from '../controllers/aiController.js';
import { authenticateToken, requireCandidate, requireCompany } from '../middleware/auth.js';

const router = Router();

// All AI routes require authentication
router.use(authenticateToken);

// ---- Candidate-only AI endpoints ----
router.post('/cv-review', requireCandidate, (req, res) => aiController.reviewCv(req as any, res));
router.post('/cv-review/revised-text', requireCandidate, (req, res) => aiController.getRevisedCvText(req as any, res));
router.post('/cv-review/export-pdf', requireCandidate, (req, res) => aiController.exportCvReviewPdf(req as any, res));
router.post('/tailor-cv', requireCandidate, (req, res) => aiController.tailorCv(req as any, res));
router.post('/tailor-cv/reordered', requireCandidate, (req, res) => aiController.tailorCvReordered(req as any, res));
router.post('/tailor-resume-for-job', requireCandidate, (req, res) => aiController.tailorResumeForJob(req as any, res));
router.get('/tailor-resume-for-job/:jobId', requireCandidate, (req, res) => aiController.getTailoredResumeForJob(req as any, res));
router.post('/tailor-resume-for-job/export-pdf', requireCandidate, (req, res) => aiController.exportTailoredResumeWithTemplate(req as any, res));
router.post('/cover-letter', requireCandidate, (req, res) => aiController.generateCoverLetter(req as any, res));
router.post('/skill-gap-analysis', requireCandidate, (req, res) => aiController.analyzeSkillGaps(req as any, res));

// ---- Company-only AI endpoints ----
router.post('/review-job-posting', requireCompany, (req, res) => aiController.reviewJobPosting(req as any, res));
router.post('/generate-job-description', requireCompany, (req, res) => aiController.generateJobDescription(req as any, res));
router.post('/interview-questions', requireCompany, (req, res) => aiController.generateInterviewQuestions(req as any, res));
router.post('/candidate-summary', requireCompany, (req, res) => aiController.generateCandidateSummary(req as any, res));

// ---- Available to any authenticated user ----
router.post('/salary-estimate', (req, res) => aiController.estimateSalary(req as any, res));
router.post('/chat', (req, res) => aiController.chat(req as any, res));

export default router;
