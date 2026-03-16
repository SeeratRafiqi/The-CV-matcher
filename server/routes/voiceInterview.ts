import { Router } from 'express';
import { voiceInterviewController } from '../controllers/voiceInterviewController.js';
import { authenticateToken, requireAnyRole, requireCandidate } from '../middleware/auth.js';

const router = Router();

router.use(authenticateToken);

router.post('/assign', requireAnyRole('company', 'admin'), (req, res) =>
  voiceInterviewController.assign(req as any, res)
);

router.post('/create-test-session', requireCandidate, (req, res) =>
  voiceInterviewController.createTestSession(req as any, res)
);

router.get('/mine', requireCandidate, (req, res) =>
  voiceInterviewController.getMySessions(req as any, res)
);

router.get('/for-application/:applicationId', requireCandidate, (req, res) =>
  voiceInterviewController.getForApplication(req as any, res)
);

router.get('/speech-config', (req, res) => voiceInterviewController.speechConfig(req as any, res));
router.post('/tts', requireCandidate, (req, res) => voiceInterviewController.tts(req as any, res));

router.get('/session/:id', requireCandidate, (req, res) =>
  voiceInterviewController.getSession(req as any, res)
);

router.get('/session/:id/report', requireCandidate, (req, res) =>
  voiceInterviewController.getReport(req as any, res)
);

router.get('/application/:applicationId/report', requireAnyRole('company', 'admin'), (req, res) =>
  voiceInterviewController.getReportForApplication(req as any, res)
);

router.post('/session/:id/start', requireCandidate, (req, res) =>
  voiceInterviewController.start(req as any, res)
);

router.post('/session/:id/answer', requireCandidate, (req, res) =>
  voiceInterviewController.submitAnswer(req as any, res)
);

export default router;
