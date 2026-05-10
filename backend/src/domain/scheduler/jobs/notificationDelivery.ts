import type { JobDefinition, JobDeps } from '../scheduler.runner.js';
import { getConfigInteger } from '../../../shared/config/platformConfig/index.js';
import { getPushProvider } from '../../../infrastructure/push/index.js';

interface PendingRow {
  id: string;
  userId: string;
  type: string;
  payload: unknown;
  retryCount: number;
}

/**
 * Drives the notifications outbox. Picks up rows where
 * deliveryStatus='pending' AND scheduledFor <= now, calls the configured
 * PushProvider for each, and transitions the row based on the result:
 *   success → deliveryStatus='sent', sentAt=now.
 *   failure but retryCount + 1 < max  → retryCount += 1 (stays pending,
 *                                       picked up next sweep).
 *   failure and retryCount + 1 >= max → deliveryStatus='failed' with
 *                                       errorMessage captured.
 *
 * Uses ConsolePushProvider by default; LivePushProvider throws and the
 * worker translates that to retry / fail. Phase 8 ships no notification
 * preferences table — every user gets every notification type. Preferences
 * land in a later phase; the worker only reads what's been written to the
 * outbox.
 */
export const notificationDeliveryJob: JobDefinition = {
  name: 'notification_delivery',
  cronConfigKey: 'cron_notification_delivery',
  defaultCronExpression: '*/30 * * * * *',
  lockTtlSeconds: 25, // shorter than the cron period so successive fires don't pile up
  description: 'Delivers pending notifications via the configured PushProvider.',
  async handler(deps: JobDeps) {
    const batchSize = await getConfigInteger('notification_batch_size');
    const maxRetries = await getConfigInteger('notification_max_retries');
    const provider = getPushProvider();

    const pending = await deps.query<PendingRow>(
      `SELECT id, "userId", type, payload, "retryCount"
       FROM notifications
       WHERE "deliveryStatus" = 'pending'
         AND "scheduledFor" <= CURRENT_TIMESTAMP
       ORDER BY "scheduledFor" ASC, "createdAt" ASC
       LIMIT :batchSize`,
      { batchSize },
    );

    let sent = 0;
    let failedTerminal = 0;
    let retried = 0;

    for (const row of pending) {
      try {
        const result = await provider.deliver({
          userId: row.userId,
          type: row.type,
          payload: (row.payload as Record<string, unknown> | null) ?? {},
        });
        if (result.success) {
          await deps.query(
            `UPDATE notifications
             SET "deliveryStatus" = 'sent',
                 "sentAt" = CURRENT_TIMESTAMP,
                 "errorMessage" = NULL
             WHERE id = :id`,
            { id: row.id },
          );
          sent += 1;
        } else {
          await handleFailure(deps, row, result.errorMessage ?? 'unknown', maxRetries);
          if (row.retryCount + 1 >= maxRetries) failedTerminal += 1;
          else retried += 1;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await handleFailure(deps, row, message, maxRetries);
        if (row.retryCount + 1 >= maxRetries) failedTerminal += 1;
        else retried += 1;
      }
    }

    return {
      itemsProcessed: pending.length,
      details: { sent, failedTerminal, retried, batchSize },
    };
  },
};

async function handleFailure(
  deps: JobDeps,
  row: PendingRow,
  errorMessage: string,
  maxRetries: number,
): Promise<void> {
  const newCount = row.retryCount + 1;
  if (newCount >= maxRetries) {
    await deps.query(
      `UPDATE notifications
       SET "deliveryStatus" = 'failed',
           "retryCount" = :newCount,
           "errorMessage" = :errorMessage
       WHERE id = :id`,
      { id: row.id, newCount, errorMessage },
    );
  } else {
    await deps.query(
      `UPDATE notifications
       SET "retryCount" = :newCount,
           "errorMessage" = :errorMessage
       WHERE id = :id`,
      { id: row.id, newCount, errorMessage },
    );
  }
}
