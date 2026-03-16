import { Router } from 'express';
import { conversationController } from '../controllers/conversationController.js';
import { authenticateToken, requireCompany } from '../middleware/auth.js';

const router = Router();

router.use(authenticateToken);
router.use(requireCompany);

router.get('/can-send-role-suggestion', (req, res) => conversationController.canSendRoleSuggestion(req as any, res));
router.post('/send-role-suggestion', (req, res) => conversationController.sendRoleSuggestion(req as any, res));

export default router;
