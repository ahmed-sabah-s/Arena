import { z } from 'zod';

// ─── enums ──────────────────────────────────────────────────────────────────

export const VenueBookingStatusSchema = z.enum([
  'requested',
  'confirmed',
  'declined',
  'cancelled',
  'completed',
  'no_show',
]);
export type VenueBookingStatus = z.infer<typeof VenueBookingStatusSchema>;

export const VenuePaymentStatusSchema = z.enum([
  'unpaid',
  'pending',
  'paid',
  'refunded',
  'failed',
]);
export type VenuePaymentStatus = z.infer<typeof VenuePaymentStatusSchema>;

// ─── entity ─────────────────────────────────────────────────────────────────

export const VenueBookingSchema = z.object({
  id: z.string().uuid(),
  venueId: z.string().uuid(),
  matchId: z.string().uuid().nullable(),
  gameId: z.string().uuid(),
  requestedByUserId: z.string().uuid(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  priceAmount: z.number().int().nonnegative(),
  priceCurrency: z.string().length(3),
  commissionAmount: z.number().int().nonnegative(),
  commissionCurrency: z.string().length(3),
  commissionPercentSnapshot: z.number(),
  status: VenueBookingStatusSchema,
  paymentStatus: VenuePaymentStatusSchema,
  paymentProvider: z.string().nullable(),
  paymentProviderReference: z.string().nullable(),
  confirmedAt: z.coerce.date().nullable(),
  declinedAt: z.coerce.date().nullable(),
  declineReason: z.string().nullable(),
  cancelledAt: z.coerce.date().nullable(),
  cancelledByUserId: z.string().uuid().nullable(),
  cancelReason: z.string().nullable(),
  completedAt: z.coerce.date().nullable(),
  notes: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type VenueBooking = z.infer<typeof VenueBookingSchema>;

// ─── inputs ─────────────────────────────────────────────────────────────────

export const RequestBookingInputSchema = z.object({
  venueId: z.string().uuid(),
  gameId: z.string().uuid(),
  matchId: z.string().uuid().optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  notes: z.string().max(2000).optional(),
}).refine((v) => v.endsAt > v.startsAt, {
  message: 'endsAt must be after startsAt',
});
export type RequestBookingInput = z.infer<typeof RequestBookingInputSchema>;

export const ConfirmBookingInputSchema = z.object({
  bookingId: z.string().uuid(),
});
export type ConfirmBookingInput = z.infer<typeof ConfirmBookingInputSchema>;

export const DeclineBookingInputSchema = z.object({
  bookingId: z.string().uuid(),
  reason: z.string().max(2000),
});
export type DeclineBookingInput = z.infer<typeof DeclineBookingInputSchema>;

export const CancelBookingInputSchema = z.object({
  bookingId: z.string().uuid(),
  reason: z.string().max(2000).optional(),
});
export type CancelBookingInput = z.infer<typeof CancelBookingInputSchema>;

export const CompleteBookingInputSchema = z.object({
  bookingId: z.string().uuid(),
});
export type CompleteBookingInput = z.infer<typeof CompleteBookingInputSchema>;

export const MarkBookingPaidInputSchema = z.object({
  bookingId: z.string().uuid(),
  providerReference: z.string().max(255).optional(),
});
export type MarkBookingPaidInput = z.infer<typeof MarkBookingPaidInputSchema>;

export const GetBookingByIdInputSchema = z.object({
  bookingId: z.string().uuid(),
});
export type GetBookingByIdInput = z.infer<typeof GetBookingByIdInputSchema>;

export const GetVenueBookingsInputSchema = z.object({
  venueId: z.string().uuid(),
  status: VenueBookingStatusSchema.optional(),
});
export type GetVenueBookingsInput = z.infer<typeof GetVenueBookingsInputSchema>;

// ─── Phase 8: admin refund flow ────────────────────────────────────────────

export const RefundBookingInputSchema = z.object({
  bookingId: z.string().uuid(),
  reason: z.string().min(1).max(2000),
});
export type RefundBookingInput = z.infer<typeof RefundBookingInputSchema>;
