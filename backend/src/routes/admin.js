import { Router } from 'express';
import { requireAdmin } from '../middleware/requireAdmin.js';

const router = Router();

router.use(requireAdmin);

// Проверка токена (для формы входа в админку)
router.get('/session', (req, res) => res.json({ ok: true }));

export default router;