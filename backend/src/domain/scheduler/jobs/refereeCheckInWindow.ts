import type { JobDefinition, JobDeps } from '../scheduler.runner.js';
import { refereeAssignmentService } from '../../referee/index.js';
import { getConfigInteger } from '../../../shared/config/platformConfig/index.js';

/**
 * For matches at status='scheduled' with matchMode='refereed' whose
 * scheduledAt is between (now + checkin_minutes_before) and (now +
 * promote_minutes_before), send the check-in request notification to all
 * accepted assignments. Phase 6 exposes this as
 * triggerCheckInWindow(matchId); the job iterates matches and calls it.
 *
 * Phase 6's service-level method also has an admin-callable wrapper that
 * does its own time-window guard. Phase 8 picks the matches for the worker
 * here and reuses the per-match service path; the picker gets its bounds
 * from platformConfig so admins can tune them.
 */
export const refereeCheckInWindowJob: JobDefinition = {
  name: 'referee_checkin_window',
  cronConfigKey: 'cron_referee_checkin_window',
  defaultCronExpression: '* * * * *',
  lockTtlSeconds: 60,
  description: 'Sends check-in requests to assigned referees as scheduledAt approaches.',
  async handler(deps: JobDeps) {
    const checkinMinutesBefore = await getConfigInteger('referee_checkin_minutes_before');
    const promoteMinutesBefore = await getConfigInteger('referee_promote_minutes_before');

    // Pick refereed scheduled matches inside [now + promote, now + checkin].
    const matches = await deps.query<{ id: string }>(
      `SELECT id FROM matches
       WHERE "matchMode" = 'refereed'
         AND status = 'scheduled'
         AND "scheduledAt" BETWEEN
              CURRENT_TIMESTAMP + (:promoteMinutes || ' minutes')::interval
          AND CURRENT_TIMESTAMP + (:checkinMinutes || ' minutes')::interval`,
      {
        promoteMinutes: promoteMinutesBefore,
        checkinMinutes: checkinMinutesBefore,
      },
    );

    let notified = 0;
    for (const m of matches) {
      try {
        // The service trigger requires an admin user id; the worker doesn't have
        // one. We look up an admin to attribute. If no admin exists, skip.
        const admin = await pickAdminUserId(deps);
        if (!admin) continue;
        const out = await refereeAssignmentService.triggerCheckInWindow(m.id, admin);
        notified += out.notified;
      } catch (err) {
        // Per-match failures don't kill the job; log and continue.
        console.error(`[referee_checkin_window] match ${m.id} failed:`, err);
      }
    }
    return { itemsProcessed: matches.length, details: { notified } };
  },
};

async function pickAdminUserId(deps: JobDeps): Promise<string | null> {
  const [row] = await deps.query<{ id: string }>(
    `SELECT u.id FROM "user" u
     JOIN "userRole" ur ON ur."userId" = u.id
     JOIN role r ON r.id = ur."roleId"
     WHERE r.name = 'admin'
     LIMIT 1`,
  );
  return row?.id ?? null;
}
