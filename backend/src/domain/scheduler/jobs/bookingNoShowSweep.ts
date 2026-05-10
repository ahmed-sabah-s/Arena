import type { JobDefinition, JobDeps } from '../scheduler.runner.js';
import { getConfigInteger } from '../../../shared/config/platformConfig/index.js';

/**
 * Marks confirmed bookings as `no_show` when their linked match was past its
 * scheduled start by the forfeit window AND the match never started. For
 * bookings with no linked match we can't tell, so we skip — venue owner
 * marks those manually if needed.
 */
export const bookingNoShowSweepJob: JobDefinition = {
  name: 'booking_no_show_sweep',
  cronConfigKey: 'cron_booking_no_show_sweep',
  defaultCronExpression: '*/15 * * * *',
  lockTtlSeconds: 60,
  description: 'Marks confirmed bookings as no_show when their match never started.',
  async handler(deps: JobDeps) {
    const forfeitMinutes = await getConfigInteger('forfeit_window_minutes');

    const rows = await deps.query<{ id: string }>(
      `UPDATE "venueBookings" b
       SET status = 'no_show'
       FROM matches m
       WHERE b."matchId" = m.id
         AND b.status = 'confirmed'
         AND m.status = 'scheduled'
         AND m."scheduledAt" + (:forfeitMinutes || ' minutes')::interval < CURRENT_TIMESTAMP
       RETURNING b.id`,
      { forfeitMinutes },
    );

    return { itemsProcessed: rows.length, details: { forfeitMinutes } };
  },
};
