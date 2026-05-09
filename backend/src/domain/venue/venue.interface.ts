import type { CustomClient } from '../../db.js';
import type {
  Venue,
  VenueAvailabilityBlackout,
  VenueAvailabilityRule,
  VenueGameConfig,
  VenuePricingModel,
  VenueStatus,
} from './venue.entity.js';

export interface CreateVenueData {
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
  primaryPhotoFileId: string | null;
}

export interface UpdateVenueData {
  name?: string;
  nameAr?: string | null;
  description?: string | null;
  city?: string;
  district?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  primaryPhotoFileId?: string | null;
}

export interface IVenueRepository {
  create(input: CreateVenueData, client?: CustomClient): Promise<Venue>;
  findById(id: string, client?: CustomClient): Promise<Venue | null>;
  findActiveById(id: string, client?: CustomClient): Promise<Venue | null>;
  findManyByOwner(ownerUserId: string): Promise<Venue[]>;
  findActiveInCity(city: string): Promise<Venue[]>;
  update(id: string, partial: UpdateVenueData, client?: CustomClient): Promise<Venue>;
  setStatus(
    id: string,
    status: VenueStatus,
    byUserId: string,
    extras: { approvedAt?: Date; rejectionReason?: string | null },
    client?: CustomClient,
  ): Promise<Venue>;
  softDelete(id: string, client?: CustomClient): Promise<void>;
}

export interface UpsertVenueGameConfigData {
  venueId: string;
  gameId: string;
  pricingModel: VenuePricingModel;
  priceAmount: number;
  priceCurrency: string;
  minBookingMinutes: number | null;
  maxBookingMinutes: number | null;
  capacity: number;
  isActive: boolean;
}

export interface IVenueGameConfigRepository {
  upsert(input: UpsertVenueGameConfigData, client?: CustomClient): Promise<VenueGameConfig>;
  findByVenue(venueId: string): Promise<VenueGameConfig[]>;
  findActiveByVenueAndGame(
    venueId: string,
    gameId: string,
    client?: CustomClient,
  ): Promise<VenueGameConfig | null>;
}

export interface AddAvailabilityRuleData {
  venueId: string;
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
}

export interface AddBlackoutData {
  venueId: string;
  startsAt: Date;
  endsAt: Date;
  reason: string | null;
  createdByUserId: string;
}

export interface IVenueAvailabilityRepository {
  addRule(input: AddAvailabilityRuleData, client?: CustomClient): Promise<VenueAvailabilityRule>;
  deleteRule(id: string, client?: CustomClient): Promise<void>;
  findRulesByVenue(venueId: string, client?: CustomClient): Promise<VenueAvailabilityRule[]>;
  findRulesByVenueAndDay(
    venueId: string,
    dayOfWeek: number,
    client?: CustomClient,
  ): Promise<VenueAvailabilityRule[]>;
  addBlackout(input: AddBlackoutData, client?: CustomClient): Promise<VenueAvailabilityBlackout>;
  deleteBlackout(id: string, client?: CustomClient): Promise<void>;
  findBlackoutsByVenueInRange(
    venueId: string,
    startsAt: Date,
    endsAt: Date,
    client?: CustomClient,
  ): Promise<VenueAvailabilityBlackout[]>;
}
