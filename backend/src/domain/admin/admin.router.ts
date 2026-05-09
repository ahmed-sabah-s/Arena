import { router } from '../../presentation/trpc';
import { adminRefereeRouter } from '../referee/referee.router.js';

/**
 * Admin namespace. Phase 6 only surfaces the referee-admin operations
 * (assign / certify / revoke / trigger windows). Phase 8 will fold the rest
 * of the admin surface (manual match resolution, dispute handling, payouts,
 * config edits, etc.) into this same router.
 *
 * Per-procedure admin-role enforcement runs inside each service via an
 * `assertAdmin` SQL check, so this router stays a thin grouping layer.
 */
export const adminRouter = router({
  referee: adminRefereeRouter,
});
