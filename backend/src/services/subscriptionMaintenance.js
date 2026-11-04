import config from '../config/index.js';
import logger from '../utils/logger.js';
import { audit } from './auditService.js';
import { vpnSubscriptionStore } from '../models/VpnSubscription.js';
import { withLock } from './lockService.js';

// Фоновое обслуживание подписок:
//   1) помечаем истёкшие по сроку подписки статусом `expired`;
//   2) удаляем `expired`/`revoked` записи, у которых срок истёк больше
//      VPN_EXPIRED_RETENTION_DAYS дней назад (по умолчанию 30) — это «мёртвый груз»,
//      который иначе копится в админке.
//
// Доступ такие подписки теряют ещё до прогона задачи: getSubscriptionByToken()
// проверяет expires_at при каждом запросе. Задача нужна, чтобы статус в БД и в
// админке соответствовал реальности, и чтобы старьё не висело годами.

const HOUR_MS = 60 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 60 * 1000; // не тормозим старт сервиса

export async function runSubscriptionMaintenance({ reason = 'schedule' } = {}) {
  const startedAt = Date.now();
  try {
    const expired = await vpnSubscriptionStore.markExpired();
    const retentionDays = config.vpn.expiredRetentionDays;
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const removed = await vpnSubscriptionStore.deleteDeadBefore(cutoff);

    if (expired.length > 0 || removed > 0) {
      logger.info(
        { reason, expired: expired.length, removed, retentionDays, durationMs: Date.now() - startedAt },
        'subscription maintenance applied',
      );
      audit('vpn.subscription_maintenance', {
        reason,
        expired: expired.length,
        removed,
        retentionDays,
        // полный список не пишем в аудит, чтобы не раздувать лог
        expiredIds: expired.slice(0, 50).map((s) => s.id),
      });
    } else {
      logger.debug({ reason, durationMs: Date.now() - startedAt }, 'subscription maintenance: nothing to do');
    }

    return { expired: expired.length, removed };
  } catch (err) {
    logger.error({ err, reason }, 'subscription maintenance failed');
    return { error: err.message };
  }
}

export function startSubscriptionMaintenance(intervalMs = config.vpn.maintenanceIntervalMs) {
  const run = (reason) => {
    withLock('dogma:lock:subscription-maintenance', 300, () => runSubscriptionMaintenance({ reason }))
      .catch((err) => {
        logger.error({ err }, 'subscription maintenance crashed');
      });
  };

  const firstRun = setTimeout(() => run('startup'), FIRST_RUN_DELAY_MS);
  firstRun.unref?.();

  const timer = setInterval(() => run('schedule'), intervalMs);
  timer.unref?.();

  logger.info(
    { intervalMs, retentionDays: config.vpn.expiredRetentionDays },
    'subscription maintenance scheduled',
  );

  return () => {
    clearTimeout(firstRun);
    clearInterval(timer);
  };
}

export default { runSubscriptionMaintenance, startSubscriptionMaintenance };
