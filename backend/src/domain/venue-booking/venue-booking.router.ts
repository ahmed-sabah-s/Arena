import {
  router,
  protectedProcedureWithErrorHandling,
} from '../../presentation/trpc';
import {
  CancelBookingInputSchema,
  CompleteBookingInputSchema,
  ConfirmBookingInputSchema,
  DeclineBookingInputSchema,
  GetBookingByIdInputSchema,
  GetVenueBookingsInputSchema,
  MarkBookingPaidInputSchema,
  RequestBookingInputSchema,
  VenueBookingStatusSchema,
} from '@arena/shared';
import { z } from 'zod';
import { VenueBookingRepository } from './venue-booking.repository.js';
import { VenueBookingService } from './venue-booking.service.js';
import { venueService } from '../venue/venue.router.js';
import { notificationService } from '../notification';
import {
  VenueAvailabilityRepository,
  VenueGameConfigRepository,
  VenueRepository,
} from '../venue/venue.repository.js';
import { getPaymentProvider } from '../../infrastructure/payment/index.js';

const bookingRepo = new VenueBookingRepository();
const venueRepo = new VenueRepository();
const gameConfigRepo = new VenueGameConfigRepository();
const availabilityRepo = new VenueAvailabilityRepository();

export const venueBookingService = new VenueBookingService(
  bookingRepo, venueRepo, gameConfigRepo, availabilityRepo,
  notificationService, getPaymentProvider(),
);
// Reference venueService so we keep the booking router alongside venue
// changes if its surface ever depends on the venue service directly.
void venueService;

export const venueBookingRouter = router({
  request: protectedProcedureWithErrorHandling
    .input(RequestBookingInputSchema)
    .mutation(async ({ ctx, input }) =>
      venueBookingService.requestBooking(input, ctx.user.id),
    ),

  confirm: protectedProcedureWithErrorHandling
    .input(ConfirmBookingInputSchema)
    .mutation(async ({ ctx, input }) =>
      venueBookingService.confirmBooking(input.bookingId, ctx.user.id),
    ),

  decline: protectedProcedureWithErrorHandling
    .input(DeclineBookingInputSchema)
    .mutation(async ({ ctx, input }) =>
      venueBookingService.declineBooking(input.bookingId, ctx.user.id, input.reason),
    ),

  cancel: protectedProcedureWithErrorHandling
    .input(CancelBookingInputSchema)
    .mutation(async ({ ctx, input }) =>
      venueBookingService.cancelBooking(input.bookingId, ctx.user.id, input.reason),
    ),

  complete: protectedProcedureWithErrorHandling
    .input(CompleteBookingInputSchema)
    .mutation(async ({ ctx, input }) =>
      venueBookingService.completeBooking(input.bookingId, ctx.user.id),
    ),

  getById: protectedProcedureWithErrorHandling
    .input(GetBookingByIdInputSchema)
    .query(async ({ ctx, input }) =>
      venueBookingService.getById(input.bookingId, ctx.user.id),
    ),

  getMyBookings: protectedProcedureWithErrorHandling
    .input(z.object({ status: VenueBookingStatusSchema.optional() }).optional())
    .query(async ({ ctx, input }) =>
      venueBookingService.getMyBookings(ctx.user.id, input?.status),
    ),

  getVenueBookings: protectedProcedureWithErrorHandling
    .input(GetVenueBookingsInputSchema)
    .query(async ({ ctx, input }) =>
      venueBookingService.getVenueBookings(input.venueId, ctx.user.id, input.status),
    ),
});

/**
 * Admin-only booking operations. Mounted under admin.venueBooking.* by the
 * admin router.
 */
export const adminVenueBookingRouter = router({
  markPaid: protectedProcedureWithErrorHandling
    .input(MarkBookingPaidInputSchema)
    .mutation(async ({ ctx, input }) =>
      venueBookingService.markBookingPaid(
        input.bookingId, input.providerReference ?? null, ctx.user.id,
      ),
    ),
});
