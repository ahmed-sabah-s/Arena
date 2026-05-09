import type { CustomClient } from '../../db.js';
import type {
  VenueBooking,
  VenueBookingStatus,
  VenuePaymentStatus,
} from './venue-booking.entity.js';

export interface CreateVenueBookingData {
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
  notes: string | null;
}

export interface SetBookingStatusExtras {
  reason?: string | null;
  cancelledByUserId?: string;
  paymentProvider?: string;
  paymentProviderReference?: string;
  paymentStatus?: VenuePaymentStatus;
}

export interface IVenueBookingRepository {
  create(input: CreateVenueBookingData, client: CustomClient): Promise<VenueBooking>;
  findById(id: string, client?: CustomClient): Promise<VenueBooking | null>;
  findByIdForUpdate(id: string, client: CustomClient): Promise<VenueBooking | null>;
  findManyByVenue(venueId: string, statusFilter?: VenueBookingStatus): Promise<VenueBooking[]>;
  findManyByRequester(userId: string, statusFilter?: VenueBookingStatus): Promise<VenueBooking[]>;
  findOverlappingActive(
    venueId: string,
    startsAt: Date,
    endsAt: Date,
    client?: CustomClient,
  ): Promise<VenueBooking[]>;
  setStatus(
    id: string,
    status: VenueBookingStatus,
    client: CustomClient,
    extras?: SetBookingStatusExtras,
  ): Promise<VenueBooking>;
  attachPaymentReference(
    id: string,
    provider: string,
    providerReference: string,
    paymentStatus: VenuePaymentStatus,
    client: CustomClient,
  ): Promise<VenueBooking>;
  setPaymentStatus(
    id: string,
    paymentStatus: VenuePaymentStatus,
    client: CustomClient,
    providerReference?: string,
  ): Promise<VenueBooking>;
}
