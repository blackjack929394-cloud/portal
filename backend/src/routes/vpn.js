import { Router } from 'express';
import * as ctrl from '../controllers/vpnController.js';
import { requireAuth } from '../auth/index.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

const router = Router();
const adminRouter = Router();

// ── User-facing ──────────────────────────────────────────────────────────────
router.get('/vpn/subscription', requireAuth, ctrl.getMySubscription);
router.post('/vpn/subscriptions', requireAuth, ctrl.createSubscription);
router.post('/vpn/subscription/revoke', requireAuth, ctrl.revokeMySubscription);

// ── Public client API (no auth, token-based) ─────────────────────────────────
router.get('/sub/:token', ctrl.getSubscriptionConfig);

// ── Admin ────────────────────────────────────────────────────────────────────
adminRouter.use(requireAdmin);
adminRouter.get('/nodes', ctrl.listNodes);
adminRouter.post('/nodes', ctrl.createNode);
adminRouter.patch('/nodes/:id', ctrl.updateNode);
adminRouter.delete('/nodes/:id', ctrl.deleteNode);
adminRouter.post('/nodes/:id/toggle', ctrl.toggleNode);
adminRouter.post('/nodes/:id/deploy', ctrl.deployNodeController);
adminRouter.get('/nodes/:id/deploy-status', ctrl.getDeployStatus);
adminRouter.post('/nodes/:id/redeploy', ctrl.redeployNodeController);
adminRouter.post('/nodes/:id/rotate-wg-keys', ctrl.rotateWgKeysController);
adminRouter.get('/subscriptions', ctrl.listSubscriptions);
adminRouter.post('/subscriptions/:id/revoke', ctrl.revokeSubscription);
adminRouter.get('/stats', ctrl.getStats);

router.use('/vpn', adminRouter);

export default router;
