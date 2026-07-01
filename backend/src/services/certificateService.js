import config from '../config/index.js';
import logger from '../utils/logger.js';
import { audit } from './auditService.js';
import { certificateRequestStore, RequestStatus } from '../models/CertificateRequest.js';
import { createCheckpointAdapter } from './checkpoint/index.js';
import { InMemoryQueue } from '../queue/requestQueue.js';
import { generateToken } from '../utils/secureToken.js';
import { sendPasswordEmail, emailEnabled } from './emailService.js';
import { savePassword, vaultEnabled, getPassword } from '../store/adminVault.js';

const adapter = createCheckpointAdapter();

function processJob(job) {
  return processRequest(job.id);
}

const queue = new InMemoryQueue(processJob, { concurrency: 1 });

// Stage 5D: заявки переживают перезапуск (хранятся в БД), но очередь — в памяти.
// Если процесс упал между QUEUED/PROCESSING и обработкой, на старте довыполняем их.
export function recoverPendingRequests() {
  const pending = certificateRequestStore.listByStatus?.([
    RequestStatus.QUEUED,
    RequestStatus.PROCESSING,
  ]);
  if (!pending || pending.length === 0) return;
  logger.warn({ count: pending.length }, 'Recovering pending certificate requests after restart');
  pending.forEach((r) => queue.enqueue({ id: r.id }));
}

// ── Public API ──────────────────────────────────────────────────────────────

export function submitRequest({ fullName, email, meta }) {
  const record = certificateRequestStore.create({ fullName, email, meta });
  const initialStatus = config.requireApproval
    ? RequestStatus.PENDING_APPROVAL
    : RequestStatus.QUEUED;
  certificateRequestStore.update(record.id, { status: initialStatus });

  audit('request.created', {
    requestId: record.id,
    fullName,
    requireApproval: config.requireApproval,
    ip: meta?.ip,
  });

  if (!config.requireApproval) queue.enqueue({ id: record.id });
  return certificateRequestStore.get(record.id);
}

export function approveRequest(id) {
  const record = certificateRequestStore.get(id);
  if (!record) return null;
  if (record.status !== RequestStatus.PENDING_APPROVAL) return record;
  certificateRequestStore.update(id, { status: RequestStatus.QUEUED });
  audit('request.approved', { requestId: id });
  queue.enqueue({ id });
  return certificateRequestStore.get(id);
}

export function getStatus(id) {
  const record = certificateRequestStore.get(id);
  return record ? publicView(record) : null;
}

// Consume the one-time download token; returns the artifact for delivery.
export function consumeDownload(token) {
  const record = certificateRequestStore.findByDownloadToken(token);
  if (!record) return { error: 'NOT_FOUND' };
  if (!record.downloadTokenExpiresAt || new Date(record.downloadTokenExpiresAt) < new Date()) {
    certificateRequestStore.update(record.id, { status: RequestStatus.EXPIRED });
    return { error: 'EXPIRED' };
  }
  certificateRequestStore.update(record.id, {
    status: RequestStatus.DELIVERED,
    downloadToken: null, // one-time
    fileDeliveredAt: new Date().toISOString(),
  });
  audit('request.delivered', { requestId: record.id, artifactType: record.artifact?.type });
  return { artifact: record.artifact };
}

// Consume the one-time password-reveal token (p12 only).
// Пароль берётся из зашифрованного vault — в хранилище заявок его нет.
export function revealPassword(token) {
  const record = certificateRequestStore.findByPasswordToken(token);
  if (!record) return { error: 'NOT_FOUND' };
  if (!record.passwordTokenExpiresAt || new Date(record.passwordTokenExpiresAt) < new Date()) {
    return { error: 'EXPIRED' };
  }
  const entry = vaultEnabled() ? getPassword(record.id) : null;
  if (!entry?.password) return { error: 'NOT_FOUND' };
  certificateRequestStore.update(record.id, {
    passwordToken: null, // one-time
    passwordRevealedAt: new Date().toISOString(),
  });
  audit('request.password_revealed', { requestId: record.id });
  return { password: entry.password };
}

// ── Internal ──────────────────────────────────────────────────────────────

async function processRequest(id) {
  const record = certificateRequestStore.get(id);
  if (!record) return;
  certificateRequestStore.update(id, { status: RequestStatus.PROCESSING });
  audit('request.processing', { requestId: id });

  try {
    const artifact = await adapter.issue({
      id: record.id,
      fullName: record.fullName,
      email: record.email,
    });

    const expiresAt = new Date(
      Date.now() + config.downloadTokenTtlSeconds * 1000,
    ).toISOString();

    const patch = {
      status: RequestStatus.ISSUED,
      artifact,
      downloadToken: generateToken(32),
      downloadTokenExpiresAt: expiresAt,
    };

    if (artifact.type === 'p12') {
      const passwordToken = generateToken(32);
      patch.passwordToken = passwordToken;
      patch.passwordTokenExpiresAt = expiresAt;
    }

    certificateRequestStore.update(id, patch);
    audit('request.issued', { requestId: id, artifactType: artifact.type });

    if (artifact.type === 'p12') {
      try {
        if (vaultEnabled()) {
          savePassword({
            requestId: id,
            fullName: record.fullName,
            email: record.email,
            fileName: artifact.fileName,
            password: artifact.password,
          });
          audit('request.password_vaulted', { requestId: id });
        }
      } catch (err) {
        logger.error({ err, requestId: id }, 'failed to vault password');
      }
      const fresh = certificateRequestStore.get(id);
      await deliverPassword(fresh, artifact);
    }
  } catch (err) {
    certificateRequestStore.update(id, { status: RequestStatus.FAILED, error: err.message });
    audit('request.failed', { requestId: id, error: err.message });
    logger.error({ err, requestId: id }, 'certificate issuance failed');
  }
}

// Доставка пароля к .p12: e-mail (если настроен SMTP и есть почта), иначе лог.
async function deliverPassword(record, artifact) {
  audit('request.password_pending_delivery', { requestId: record.id });
  if (record.email && emailEnabled()) {
    try {
      await sendPasswordEmail({
        to: record.email,
        fullName: record.fullName,
        password: artifact.password,
        fileName: artifact.fileName,
      });
      audit('request.password_emailed', { requestId: record.id });
      return;
    } catch (err) {
      audit('request.password_email_failed', { requestId: record.id, error: err.message });
      logger.error({ err, requestId: record.id }, 'failed to email password');
    }
  }
  logger.warn(
    { requestId: record.id, passwordRevealPath: `/api/v1/password/${record.passwordToken}` },
    'Password not emailed (no SMTP or no email); reveal link logged.',
  );
}

// What the API exposes about a request — never the secret material directly.
function publicView(record) {
  const view = {
    id: record.id,
    fullName: record.fullName,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    error: record.error,
  };
  if (record.status === RequestStatus.ISSUED && record.artifact) {
    view.delivery = {
      type: record.artifact.type,
      downloadToken: record.downloadToken,
      expiresAt: record.downloadTokenExpiresAt,
      // passwordToken is intentionally NOT exposed here — out-of-band only.
      passwordRequired: record.artifact.type === 'p12',
    };
  }
  return view;
}
