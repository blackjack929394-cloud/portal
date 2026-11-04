import { Router } from 'express';
import * as ctrl from '../controllers/vpnController.js';
import * as clients from '../controllers/clientController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

const router = Router();
const adminRouter = Router();

// ── User-facing ──────────────────────────────────────────────────────────────
router.get('/vpn/subscription', requireAuth, ctrl.getMySubscription);
router.post('/vpn/subscriptions', requireAuth, ctrl.createSubscription);
router.post('/vpn/subscription/revoke', requireAuth, ctrl.revokeMySubscription);
router.get('/vpn/routing', requireAuth, ctrl.getMyRouting);
router.put('/vpn/routing', requireAuth, ctrl.updateMyRouting);
router.get('/chat', requireAuth, ctrl.getMyChat);
router.get('/chat/unread', requireAuth, ctrl.getMyChatUnread);
router.post('/chat', requireAuth, ctrl.sendMyChatMessage);

// ── Public client API (no auth, token-based) ─────────────────────────────────
router.get('/sub/:token', ctrl.getSubscriptionConfig);

// ── Public download metadata (page /download) ────────────────────────────────
router.get('/clients', clients.listClients);
router.get('/clients/:id/download', clients.downloadClient);

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
adminRouter.get('/pending', ctrl.listPendingSubscriptions);
adminRouter.get('/chats', ctrl.listChats);
adminRouter.get('/chats/messages', ctrl.getChatMessages);
adminRouter.post('/chats/messages', ctrl.sendAdminChatMessage);
adminRouter.post('/subscriptions/:id/approve', ctrl.approveSubscriptionController);
adminRouter.post('/subscriptions/:id/deny', ctrl.denySubscriptionController);
adminRouter.post('/subscriptions/:id/revoke', ctrl.revokeSubscription);
adminRouter.patch('/subscriptions/:id', ctrl.updateSubscriptionController);
adminRouter.delete('/subscriptions/:id', ctrl.deleteSubscription);
adminRouter.get('/stats', ctrl.getStats);
adminRouter.get('/devices', ctrl.listAppDevicesController);
adminRouter.delete('/devices/:id', ctrl.revokeAppDeviceAdminController);
adminRouter.get('/users', ctrl.listUsersController);
adminRouter.patch('/users/:username/limits', ctrl.updateUserLimitsController);
adminRouter.get('/users/:username/routing', ctrl.getUserRoutingController);
adminRouter.post('/users/:username/block', ctrl.setUserBlockedController);
adminRouter.delete('/users/:username', ctrl.deleteUserController);

router.use('/vpn', adminRouter);

export default router;
