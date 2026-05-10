import type { JobDefinition, JobDeps } from '../scheduler.runner.js';

/**
 * Counts OTP requests that have aged past their expiry window without being
 * consumed. The application code already treats unconsumed-and-expired OTPs
 * as invalid at use time, so this job is purely observability — it gives
 * ops a per-sweep count of how many requests are wasting space and could be
 * candidates for cleanup. The actual delete happens in
 * `otpRetentionCleanup` once a day.
 */
export const otpExpirySweepJob: JobDefinition = {
  name: 'otp_expiry_sweep',
  cronConfigKey: 'cron_otp_expiry_sweep',
  defaultCronExpression: '*/10 * * * *',
  lockTtlSeconds: 30,
  description: 'Counts past-expiry unconsumed OTP requests for ops observability.',
  async handler(deps: JobDeps) {
    const [row] = await deps.query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM "otpRequests"
       WHERE "consumedAt" IS NULL
         AND "expiresAt" < CURRENT_TIMESTAMP - INTERVAL '1 hour'`,
    );
    const expired = Number.parseInt(row?.count ?? '0', 10);
    return { itemsProcessed: expired, details: { expired } };
  },
};
