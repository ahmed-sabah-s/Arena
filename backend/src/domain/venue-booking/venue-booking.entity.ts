export type VenueBookingStatus =
  | 'requested'
  | 'confirmed'
  | 'declined'
  | 'cancelled'
  | 'completed'
  | 'no_show';

export type VenuePaymentStatus =
  | 'unpaid'
  | 'pending'
  | 'paid'
  | 'refunded'
  | 'failed';

export interface VenueBooking {
  id: string;
  venueId: string;
  matchId: string | null;
  gameId: string;
  requestedByUserId: string;
  startsAt: Date;
  endsAt: Date;
  priceAmount: number;
  priceCurrency: string;
  commissionAmount: number;
  commissionCurrency: string;
  commissionPercentSnapshot: number;
  status: VenueBookingStatus;
  paymentStatus: VenuePaymentStatus;
  paymentProvider: string | null;
  paymentProviderReference: string | null;
  confirmedAt: Date | null;
  declinedAt: Date | null;
  declineReason: string | null;
  cancelledAt: Date | null;
  cancelledByUserId: string | null;
  cancelReason: string | null;
  completedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}
