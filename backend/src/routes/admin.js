import { Router } from 'express';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { audit } from '../services/auditService.js';
import { getPassword, listEntries, vaultEnabled } from '../store/adminVault.js';
import { listGuests, listEmployees } from '../store/userDirectory.js';

const router = Router();

router.use(requireAdmin);

// Проверка токена (для формы входа в админку)
router.get('/session', (req, res) => res.json({ ok: true, vaultEnabled: vaultEnabled() }));

// Список выданных паролей (без самих паролей)
router.get('/passwords', (req, res) => {
  if (!vaultEnabled()) return res.status(503).json({ error: 'VAULT_DISABLED' });
  return res.json({ entries: listEntries() });
});

// Конкретный пароль по requestId (расшифровывается)
router.get('/passwords/:requestId', (req, res) => {
  if (!vaultEnabled()) return res.status(503).json({ error: 'VAULT_DISABLED' });
  const entry = getPassword(req.params.requestId);
  if (!entry) return res.status(404).json({ error: 'NOT_FOUND' });
  audit('admin.password_viewed', { requestId: req.params.requestId, by: req.ip });
  return res.json(entry);
});

// Каталог пользователей
router.get('/guests', (req, res) => res.json({ entries: listGuests() }));
router.get('/employees', (req, res) => res.json({ entries: listEmployees() }));

export default router;
