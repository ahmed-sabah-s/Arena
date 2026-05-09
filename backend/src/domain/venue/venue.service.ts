import { transaction, query } from '../../db.js';
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../shared/errors/index.js';
import type {
  Venue,
  VenueAvailabilityBlackout,
  VenueAvailabilityRule,
  VenueGameConfig,
  VenuePricingModel,
} from './venue.entity.js';
import type {
  IVenueAvailabilityRepository,
  IVenueGameConfigRepository,
  IVenueRepository,
} from './venue.interface.js';
import { checkAvailability, type AvailabilityCheck } from './venue.availability.js';
import type { NotificationService } from '../notification/notification.service.js';

export interface CreateVenueInput {
  name: string;
  nameAr?: string;
  description?: string;
  city: string;
  district?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  country?: string;
  defaultCurrency?: string;
  contactPhone?: string;
  contactEmail?: string;
  primaryPhotoFileId?: string;
}

export interface UpdateVenueInput {
  name?: string;
  nameAr?: string;
  description?: string;
  city?: string;
  district?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  contactPhone?: string;
  contactEmail?: string;
  primaryPhotoFileId?: string;
}

export interface UpsertVenueGameConfigInput {
  pricingModel: VenuePricingModel;
  priceAmount: number;
  priceCurrency: string;
  minBookingMinutes?: number;
  maxBookingMinutes?: number;
  capacity?: number;
  isActive?: boolean;
}

/**
 * Venue management surface — owner self-service plus admin approval flow.
 *
 * Role-grant: createVenue grants the venue_owner role to the caller if they
 * don't already have it. From there the standing role/permission system
 * handles authorization for owner-side operations.
 *
 * Status lifecycle:
 *   pending_approval → active (admin) | rejected (admin)
 *   active           → paused (owner) | archived (owner) | rejected (admin)
 *   paused           → active (owner; "resume")
 *   rejected         → pending_approval (owner; via update + resubmit — Phase 8)
 *   archived         → terminal
 */
export class VenueService {
  constructor(
    private readonly repo: IVenueRepository,
    private readonly gameConfigRepo: IVenueGameConfigRepository,
    private readonly availabilityRepo: IVenueAvailabilityRepository,
    private readonly notificationService: NotificationService,
  ) {}

  async createVenue(input: CreateVenueInput, byUserId: string): Promise<Venue> {
    return await transaction(async (client) => {
      // Currency must exist + be active.
      await this.assertCurrencyActive(input.defaultCurrency ?? 'IQD');

      const venue = await this.repo.create({
        ownerUserId: byUserId,
        name: input.name,
        nameAr: input.nameAr ?? null,
        description: input.description ?? null,
        city: input.city,
        district: input.district ?? null,
        address: input.address ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        country: input.country ?? 'IQ',
        defaultCurrency: input.defaultCurrency ?? 'IQD',
        contactPhone: input.contactPhone ?? null,
        contactEmail: input.contactEmail ?? null,
        primaryPhotoFileId: input.primaryPhotoFileId ?? null,
      }, client);

      // Grant venue_owner role if not already granted.
      await client.query(
        `INSERT INTO "userRole" ("userId", "roleId")
         SELECT :byUserId, r.id FROM role r WHERE r.name = 'venue_owner'
         ON CONFLICT ("userId", "roleId") DO NOTHING`,
        { byUserId },
      );

      return venue;
    });
  }

  async getById(venueId: string, byUserId: string | null): Promise<Venue> {
    const venue = await this.repo.findById(venueId);
    if (!venue) throw new NotFoundError('Venue');
    if (venue.status === 'active') return venue;
    // Non-active venues are visible only to their owner or an admin.
    if (!byUserId) throw new AuthorizationError('VENUE_NOT_PUBLIC');
    if (venue.ownerUserId === byUserId) return venue;
    if (await this.isAdmin(byUserId)) return venue;
    throw new AuthorizationError('VENUE_NOT_PUBLIC');
  }

  async getMyVenues(byUserId: string): Promise<Venue[]> {
    return this.repo.findManyByOwner(byUserId);
  }

  async searchInCity(city: string): Promise<Venue[]> {
    return this.repo.findActiveInCity(city);
  }

  async updateVenue(venueId: string, input: UpdateVenueInput, byUserId: string): Promise<Venue> {
    const venue = await this.assertOwnership(venueId, byUserId);
    if (venue.status === 'archived') throw new ConflictError('VENUE_ARCHIVED');
    return this.repo.update(venueId, input);
  }

  async approveVenue(venueId: string, byAdminUserId: string): Promise<Venue> {
    await this.assertAdmin(byAdminUserId);
    const venue = await this.repo.findById(venueId);
    if (!venue) throw new NotFoundError('Venue');
    if (venue.status !== 'pending_approval' && venue.status !== 'paused') {
      throw new ConflictError('VENUE_NOT_APPROVABLE');
    }
    const updated = await this.repo.setStatus(
      venueId, 'active', byAdminUserId, { approvedAt: new Date() },
    );
    await this.notificationService.enqueue({
      userId: venue.ownerUserId,
      type: 'venue_approved',
      payload: { venueId },
    });
    return updated;
  }

  async rejectVenue(venueId: string, byAdminUserId: string, reason: string): Promise<Venue> {
    await this.assertAdmin(byAdminUserId);
    const venue = await this.repo.findById(venueId);
    if (!venue) throw new NotFoundError('Venue');
    if (venue.status !== 'pending_approval') {
      throw new ConflictError('VENUE_NOT_REJECTABLE');
    }
    const updated = await this.repo.setStatus(
      venueId, 'rejected', byAdminUserId, { rejectionReason: reason },
    );
    await this.notificationService.enqueue({
      userId: venue.ownerUserId,
      type: 'venue_rejected',
      payload: { venueId, reason },
    });
    return updated;
  }

  async pauseVenue(venueId: string, byUserId: string): Promise<Venue> {
    const venue = await this.assertOwnership(venueId, byUserId);
    if (venue.status !== 'active') throw new ConflictError('VENUE_NOT_PAUSABLE');
    return this.repo.setStatus(venueId, 'paused', byUserId, {});
  }

  async resumeVenue(venueId: string, byUserId: string): Promise<Venue> {
    const venue = await this.assertOwnership(venueId, byUserId);
    if (venue.status !== 'paused') throw new ConflictError('VENUE_NOT_RESUMABLE');
    if (!venue.approvedAt) throw new ConflictError('VENUE_NEVER_APPROVED');
    return this.repo.setStatus(venueId, 'active', byUserId, { approvedAt: venue.approvedAt });
  }

  async archiveVenue(venueId: string, byUserId: string): Promise<Venue> {
    return await transaction(async (client) => {
      const venue = await this.assertOwnership(venueId, byUserId, client);
      if (venue.status === 'archived') return venue;

      const updated = await this.repo.setStatus(venueId, 'archived', byUserId, {}, client);

      // Cancel all future pending/confirmed bookings for this venue.
      const cancelled = await client.query<{ id: string; requestedByUserId: string }>(
        `UPDATE "venueBookings"
         SET status = 'cancelled',
             "cancelledAt" = CURRENT_TIMESTAMP,
             "cancelledByUserId" = :byUserId,
             "cancelReason" = 'Venue archived'
         WHERE "venueId" = :venueId
           AND status IN ('requested', 'confirmed')
           AND "startsAt" > CURRENT_TIMESTAMP
         RETURNING id, "requestedByUserId"`,
        { byUserId, venueId },
      );
      for (const row of cancelled.rows) {
        await this.notificationService.enqueue({
          userId: row.requestedByUserId,
          type: 'venue_booking_cancelled',
          payload: { bookingId: row.id, reason: 'venue_archived' },
        }, client);
      }
      return updated;
    });
  }

  // ─── pricing ─────────────────────────────────────────────────────────────

  async upsertGameConfig(
    venueId: string,
    gameId: string,
    input: UpsertVenueGameConfigInput,
    byUserId: string,
  ): Promise<VenueGameConfig> {
    await this.assertOwnership(venueId, byUserId);
    if (input.priceAmount < 0) throw new ValidationError('PRICE_AMOUNT_NEGATIVE');
    await this.assertCurrencyActive(input.priceCurrency);
    return this.gameConfigRepo.upsert({
      venueId,
      gameId,
      pricingModel: input.pricingModel,
      priceAmount: input.priceAmount,
      priceCurrency: input.priceCurrency,
      minBookingMinutes: input.minBookingMinutes ?? null,
      maxBookingMinutes: input.maxBookingMinutes ?? null,
      capacity: input.capacity ?? 1,
      isActive: input.isActive ?? true,
    });
  }

  async getGameConfigs(venueId: string): Promise<VenueGameConfig[]> {
    return this.gameConfigRepo.findByVenue(venueId);
  }

  // ─── availability ────────────────────────────────────────────────────────

  async addAvailabilityRule(
    venueId: string,
    dayOfWeek: number,
    openTime: string,
    closeTime: string,
    byUserId: string,
  ): Promise<VenueAvailabilityRule> {
    await this.assertOwnership(venueId, byUserId);
    if (!isValidDayOfWeek(dayOfWeek)) throw new ValidationError('INVALID_DAY_OF_WEEK');
    return this.availabilityRepo.addRule({ venueId, dayOfWeek, openTime, closeTime });
  }

  async removeAvailabilityRule(ruleId: string, byUserId: string): Promise<{ removed: true }> {
    // Look up rule's venue and assert ownership.
    const [row] = await query<{ venueId: string }>(
      `SELECT "venueId" FROM "venueAvailabilityRules" WHERE id = :id`,
      { id: ruleId },
    );
    if (!row) throw new NotFoundError('VenueAvailabilityRule');
    await this.assertOwnership(row.venueId, byUserId);
    await this.availabilityRepo.deleteRule(ruleId);
    return { removed: true };
  }

  async addBlackout(
    venueId: string,
    startsAt: Date,
    endsAt: Date,
    reason: string | null,
    byUserId: string,
  ): Promise<VenueAvailabilityBlackout> {
    await this.assertOwnership(venueId, byUserId);
    if (endsAt <= startsAt) throw new ValidationError('BLACKOUT_ENDS_BEFORE_STARTS');
    return this.availabilityRepo.addBlackout({
      venueId, startsAt, endsAt, reason, createdByUserId: byUserId,
    });
  }

  async removeBlackout(blackoutId: string, byUserId: string): Promise<{ removed: true }> {
    const [row] = await query<{ venueId: string }>(
      `SELECT "venueId" FROM "venueAvailabilityBlackouts" WHERE id = :id`,
      { id: blackoutId },
    );
    if (!row) throw new NotFoundError('VenueAvailabilityBlackout');
    await this.assertOwnership(row.venueId, byUserId);
    await this.availabilityRepo.deleteBlackout(blackoutId);
    return { removed: true };
  }

  async getAvailabilityRules(venueId: string): Promise<VenueAvailabilityRule[]> {
    return this.availabilityRepo.findRulesByVenue(venueId);
  }

  async checkAvailabilityAt(venueId: string, timestamp: Date): Promise<AvailabilityCheck> {
    const dow = timestamp.getUTCDay();
    const rules = await this.availabilityRepo.findRulesByVenueAndDay(venueId, dow);
    const blackouts = await this.availabilityRepo.findBlackoutsByVenueInRange(
      venueId,
      new Date(timestamp.getTime() - 1),
      new Date(timestamp.getTime() + 1),
    );
    return checkAvailability(timestamp, rules, blackouts);
  }

  // ─── helpers ─────────────────────────────────────────────────────────────

  private async assertOwnership(
    venueId: string,
    byUserId: string,
    client?: import('../../db.js').CustomClient,
  ): Promise<Venue> {
    const venue = await this.repo.findById(venueId, client);
    if (!venue) throw new NotFoundError('Venue');
    if (venue.ownerUserId !== byUserId) throw new AuthorizationError('NOT_VENUE_OWNER');
    return venue;
  }

  private async assertAdmin(userId: string): Promise<void> {
    const [row] = await query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM "userRole" ur
         JOIN role r ON r.id = ur."roleId"
         WHERE ur."userId" = :userId AND r.name = 'admin'
       ) AS exists`,
      { userId },
    );
    if (!row?.exists) throw new AuthorizationError('NOT_ADMIN');
  }

  private async isAdmin(userId: string): Promise<boolean> {
    const [row] = await query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM "userRole" ur
         JOIN role r ON r.id = ur."roleId"
         WHERE ur."userId" = :userId AND r.name = 'admin'
       ) AS exists`,
      { userId },
    );
    return Boolean(row?.exists);
  }

  private async assertCurrencyActive(code: string): Promise<void> {
    const [row] = await query<{ isActive: boolean }>(
      `SELECT "isActive" FROM currencies WHERE code = :code`,
      { code },
    );
    if (!row) throw new ValidationError('CURRENCY_NOT_FOUND');
    if (!row.isActive) throw new ValidationError('CURRENCY_INACTIVE');
  }
}

function isValidDayOfWeek(d: number): boolean {
  return Number.isInteger(d) && d >= 0 && d <= 6;
}
