import { Router } from 'express';
import * as ctrl from '../controllers/certificateController.js';
import { createRequestLimiter } from '../middleware/rateLimiter.js';
import { requireAuth } from '../auth/index.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

const router = Router();

// Submit a new certificate request (identity comes from the session, not the body)
router.post('/certificate-requests', requireAuth, createRequestLimiter, ctrl.createRequest);

// Poll request status
router.get('/certificate-requests/:id', ctrl.getStatus);

// Approve a pending request — ADMIN ONLY.
router.post('/certificate-requests/:id/approve', requireAdmin, ctrl.approve);

// One-time download of the issued artifact (file or registration key)
router.get('/download/:token', ctrl.download);

// One-time reveal of the .p12 password (delivered out-of-band)
router.get('/password/:token', ctrl.revealPassword);

export default router;
