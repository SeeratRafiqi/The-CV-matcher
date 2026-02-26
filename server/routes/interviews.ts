import { Router } from 'express';
import { interviewController } from '../controllers/interviewController.js';
import { authenticateToken, requireAnyRole, requireCandidate } from '../middleware/auth.js';

const router = Router();

router.use(authenticateToken);

// Company/admin lifecycle
router.post('/assign', requireAnyRole('company', 'admin'), (req, res) => interviewController.assign(req as any, res));
router.post('/:id/reissue', requireAnyRole('company', 'admin'), (req, res) => interviewController.reissue(req as any, res));
router.get('/application/:applicationId', requireAnyRole('company', 'admin'), (req, res) => interviewController.getForApplication(req as any, res));

// Candidate lifecycle
router.get('/mine', requireCandidate, (req, res) => interviewController.getMyAssessments(req as any, res));
router.get('/:id', requireCandidate, (req, res) => interviewController.getCandidateAssessment(req as any, res));
router.post('/:id/start', requireCandidate, (req, res) => interviewController.start(req as any, res));
router.put('/:id/answers/:questionId', requireCandidate, (req, res) => interviewController.saveAnswer(req as any, res));
router.post('/:id/submit', requireCandidate, (req, res) => interviewController.submit(req as any, res));

// Shared read/report
router.get('/:id/report', requireAnyRole('candidate', 'company', 'admin'), (req, res) => interviewController.getReport(req as any, res));

// Admin maintenance
router.post('/admin/expiry-sweep', requireAnyRole('admin'), (req, res) => interviewController.runExpirySweep(req as any, res));

export default router;
