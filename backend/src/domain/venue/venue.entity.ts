export type VenueStatus =
  | 'pending_approval'
  | 'active'
  | 'paused'
  | 'rejected'
  | 'archived';

export type VenuePricingModel = 'hourly' | 'per_game' | 'per_session';

export interface Venue {
  id: string;
  ownerUserId: string;
  name: string;
  nameAr: string | null;
  description: string | null;
  city: string;
  district: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  country: string;
  defaultCurrency: string;
  contactPhone: string | null;
  contactEmail: string | null;
  status: VenueStatus;
  approvedAt: Date | null;
  approvedByUserId: string | null;
  rejectionReason: string | null;
  primaryPhotoFileId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface VenueGameConfig {
  id: string;
  venueId: string;
  gameId: string;
  pricingModel: VenuePricingModel;
  priceAmount: number;
  priceCurrency: string;
  minBookingMinutes: number | null;
  maxBookingMinutes: number | null;
  capacity: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface VenueAvailabilityRule {
  id: string;
  venueId: string;
  dayOfWeek: number; // 0=Sunday … 6=Saturday (Postgres EXTRACT(DOW FROM ...))
  openTime: string;  // 'HH:MM:SS' or 'HH:MM'
  closeTime: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface VenueAvailabilityBlackout {
  id: string;
  venueId: string;
  startsAt: Date;
  endsAt: Date;
  reason: string | null;
  createdByUserId: string;
  createdAt: Date;
}
