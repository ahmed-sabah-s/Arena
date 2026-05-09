import { router } from '../../presentation/trpc';
import { adminRefereeRouter } from '../referee/referee.router.js';
import { adminVenueRouter } from '../venue/venue.router.js';
import { adminVenueBookingRouter } from '../venue-booking/venue-booking.router.js';

/**
 * Admin namespace. Phase 6 added referee-admin operations; Phase 7 adds
 * venue approve/reject + booking markPaid. Phase 8 will fold the rest of
 * the admin surface (manual match resolution, dispute handling, payouts,
 * config edits, etc.) into this same router.
 *
 * Per-procedure admin-role enforcement runs inside each service via an
 * `assertAdmin` / `isAdmin` SQL check, so this router stays a thin
 * grouping layer.
 */
export const adminRouter = router({
  referee: adminRefereeRouter,
  venue: adminVenueRouter,
  venueBooking: adminVenueBookingRouter,
});
