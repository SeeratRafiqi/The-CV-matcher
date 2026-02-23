import { Router } from 'express';
import express from 'express';
import { jobController } from '../controllers/jobController.js';
import { upload } from '../middleware/upload.js';
import { authenticateToken, requireCompany, requireAnyRole } from '../middleware/auth.js';

const router = Router();

// JSON parser for the from-url route specifically
const jsonParser = express.json();

// ========== Admin/General job routes ==========
router.get('/', (req, res) => jobController.list(req, res));
router.get('/:id', (req, res) => jobController.get(req, res));
router.post('/', (req, res) => jobController.create(req, res));
router.post('/from-url', jsonParser, (req, res) => jobController.createFromUrl(req, res));
// PDF upload route - must be before /:id to avoid conflicts
router.post('/from-pdf', (req, res, next) => {
  upload.single('pdf')(req, res, (err: any) => {
    if (err) {
      return res.status(400).json({ message: err.message || 'File upload failed' });
    }
    next();
  });
}, (req, res) => jobController.createFromPdf(req, res));
router.put('/:id', (req, res) => jobController.update(req, res));
router.delete('/:id', (req, res) => jobController.delete(req, res));
router.get('/:id/matrix', (req, res) => jobController.getMatrix(req, res));
router.put('/:id/matrix', jsonParser, (req, res) => jobController.updateMatrix(req, res));
router.post('/:id/generate-matrix', (req, res) => jobController.generateMatrix(req, res));

// ========== Company job management ==========
const companyJobRouter = Router();
companyJobRouter.use(authenticateToken, requireCompany);

companyJobRouter.get('/', (req, res) => jobController.listMyJobs(req, res));
companyJobRouter.post('/', (req, res) => jobController.createCompanyJob(req, res));
companyJobRouter.post('/from-url', (req, res) => jobController.createCompanyJobFromUrl(req as any, res));
companyJobRouter.get('/:id', (req, res) => jobController.getCompanyJob(req, res));
companyJobRouter.put('/:id', (req, res) => jobController.updateCompanyJob(req, res));

export { companyJobRouter };
export default router;
