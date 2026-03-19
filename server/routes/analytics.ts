import { Router } from 'express';
import { analyticsController } from '../controllers/analyticsController.js';
import { authenticateToken, requireCompany, requireCandidate, requireAdmin } from '../middleware/auth.js';

const router = Router();

// GET /api/analytics/company — company analytics
router.get('/company', authenticateToken, requireCompany, (req, res) =>
  analyticsController.getCompanyAnalytics(req, res)
);

// GET /api/analytics/candidate — candidate analytics
router.get('/candidate', authenticateToken, requireCandidate, (req, res) =>
  analyticsController.getCandidateAnalytics(req, res)
);

// GET /api/analytics/admin — admin analytics
router.get('/admin', authenticateToken, requireAdmin, (req, res) =>
  analyticsController.getAdminAnalytics(req, res)
);

// GET /api/analytics/admin/usage — admin usage & cost (platform + per-user)
router.get('/admin/usage', authenticateToken, requireAdmin, (req, res) =>
  analyticsController.getAdminUsage(req, res)
);

// GET /api/analytics/admin/call-stats — call statistics & performance metrics (?days=7 for last N days)
router.get('/admin/call-stats', authenticateToken, requireAdmin, (req, res) =>
  analyticsController.getAdminCallStats(req, res)
);

export default router;
