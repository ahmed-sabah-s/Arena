import type { JobDefinition } from '../scheduler.runner.js';
import { matchInviteService } from '../../match-invite/index.js';

/**
 * Periodic sweep marking past-expiry match invites as `expired`. Phase 5
 * already exposes `expirePastInvites()`; the job calls it.
 */
export const matchInviteExpiryJob: JobDefinition = {
  name: 'match_invite_expiry',
  cronConfigKey: 'cron_match_invite_expiry',
  defaultCronExpression: '*/2 * * * *',
  lockTtlSeconds: 30,
  description: 'Marks past-expiry match invites as expired.',
  async handler() {
    const result = await matchInviteService.expirePastInvites();
    return {
      itemsProcessed: result.expired,
      details: { ...result },
    };
  },
};
