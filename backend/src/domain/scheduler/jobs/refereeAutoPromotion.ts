import type { JobDefinition, JobDeps } from '../scheduler.runner.js';
import { refereeAssignmentService } from '../../referee/index.js';
import { getConfigInteger } from '../../../shared/config/platformConfig/index.js';

/**
 * For matches at status='scheduled' with matchMode='refereed' whose
 * scheduledAt is at or past (now + promote_minutes_before): if the main
 * referee hasn't checked in but an assistant has, the assistant is
 * promoted to main and the main is marked no_show. Phase 6's
 * triggerAutoPromotion() does the actual work; this job picks the
 * matches and dispatches.
 *
 * Note: Phase 6 documented a transaction-isolation subtlety in the
 * first-vs-repeat-offense classification — `countNoShowsInWindow` runs
 * outside the transaction so the check uses `> 1`. The worker inherits
 * those semantics by calling the existing service method. If a future
 * refactor makes the count transaction-aware, the threshold flip needs
 * to happen there, not here.
 */
export const refereeAutoPromotionJob: JobDefinition = {
  name: 'referee_auto_promotion',
  cronConfigKey: 'cron_referee_auto_promotion',
  defaultCronExpression: '* * * * *',
  lockTtlSeconds: 60,
  description: 'Auto-promotes assistant referees when the main fails to check in.',
  async handler(deps: JobDeps) {
    const promoteMinutesBefore = await getConfigInteger('referee_promote_minutes_before');

    // Matches whose start window is now within the auto-promote threshold.
    const matches = await deps.query<{ id: string }>(
      `SELECT id FROM matches
       WHERE "matchMode" = 'refereed'
         AND status = 'scheduled'
         AND "scheduledAt" <= CURRENT_TIMESTAMP + (:minutes || ' minutes')::interval
         AND "scheduledAt" > CURRENT_TIMESTAMP - INTERVAL '1 hour'`,
      { minutes: promoteMinutesBefore },
    );

    let promoted = 0;
    for (const m of matches) {
      try {
        const admin = await pickAdminUserId(deps);
        if (!admin) continue;
        const out = await refereeAssignmentService.triggerAutoPromotion(m.id, admin);
        if (out.promoted) promoted += 1;
      } catch (err) {
        console.error(`[referee_auto_promotion] match ${m.id} failed:`, err);
      }
    }
    return { itemsProcessed: matches.length, details: { promoted } };
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
