import type { JobDefinition, JobDeps } from '../scheduler.runner.js';
import { getConfigInteger } from '../../../shared/config/platformConfig/index.js';

/**
 * Deletes OTP request rows older than `otp_retention_days` (default 30).
 * Runs once a day at 03:00 server time so deletions don't compete with
 * peak-hour OTP traffic.
 */
export const otpRetentionCleanupJob: JobDefinition = {
  name: 'otp_retention_cleanup',
  cronConfigKey: 'cron_otp_retention_cleanup',
  defaultCronExpression: '0 3 * * *',
  lockTtlSeconds: 300,
  description: 'Deletes OTP request rows older than otp_retention_days.',
  async handler(deps: JobDeps) {
    const days = await getConfigInteger('otp_retention_days');
    const rows = await deps.query<{ id: string }>(
      `DELETE FROM "otpRequests"
       WHERE "createdAt" < CURRENT_TIMESTAMP - (:days || ' days')::interval
       RETURNING id`,
      { days },
    );
    return { itemsProcessed: rows.length, details: { days } };
  },
};
