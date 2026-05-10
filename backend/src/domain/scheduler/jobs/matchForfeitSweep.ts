import type { JobDefinition } from '../scheduler.runner.js';
import { matchService } from '../../match/index.js';

/**
 * Periodic sweep that resolves stuck `awaiting_confirmation` matches whose
 * forfeit window has passed. Phase 5's match service already exposes this
 * as `applyForfeitWindow()`; the job is a thin wrapper.
 */
export const matchForfeitSweepJob: JobDefinition = {
  name: 'match_forfeit_sweep',
  cronConfigKey: 'cron_match_forfeit_sweep',
  defaultCronExpression: '*/5 * * * *',
  lockTtlSeconds: 60,
  description: 'Resolves stuck awaiting_confirmation matches past the forfeit window.',
  async handler() {
    const result = await matchService.applyForfeitWindow();
    return {
      itemsProcessed: result.resolved + result.voided,
      details: { ...result },
    };
  },
};
