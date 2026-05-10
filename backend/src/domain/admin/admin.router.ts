import { router } from '../../presentation/trpc';
import { adminRefereeRouter } from '../referee/referee.router.js';
import { adminVenueRouter } from '../venue/venue.router.js';
import { adminVenueBookingRouter } from '../venue-booking/venue-booking.router.js';
import { adminSchedulerRouter } from '../scheduler/scheduler.router.js';
import { adminUserReportRouter } from '../user-report/user-report.router.js';
import { adminDisputeRouter } from '../dispute/dispute.router.js';

/**
 * Admin namespace. Phase 6 added referee-admin; Phase 7 added venue +
 * booking admin; Phase 8 adds scheduler, dispute, user-report, match
 * override, and refund admin paths. Per-procedure admin-role enforcement
 * runs inside each service via assertAdmin / isAdmin so this router stays
 * a thin grouping layer.
 */
export const adminRouter = router({
  referee: adminRefereeRouter,
  venue: adminVenueRouter,
  venueBooking: adminVenueBookingRouter,
  scheduler: adminSchedulerRouter,
  userReport: adminUserReportRouter,
  dispute: adminDisputeRouter,
});
