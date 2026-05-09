import { transaction, query } from '../../db.js';
import type { CustomClient } from '../../db.js';
import {
  AppError,
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
  isPgError,
} from '../../shared/errors/index.js';
import { getConfigNumber } from '../../shared/config/platformConfig/index.js';
import type { Currency } from '@arena/shared';
import type {
  VenueBooking,
  VenueBookingStatus,
} from './venue-booking.entity.js';
import type {
  IVenueBookingRepository,
} from './venue-booking.interface.js';
import { calculateCommission } from './venue-booking.commission.js';
import type {
  IVenueAvailabilityRepository,
  IVenueGameConfigRepository,
  IVenueRepository,
} from '../venue/venue.interface.js';
import { checkAvailability } from '../venue/venue.availability.js';
import type { NotificationService } from '../notification/notification.service.js';
import type { PaymentProvider } from '../../infrastructure/payment/index.js';
import { roundMoney } from '../../shared/money/index.js';

export interface RequestBookingInput {
  venueId: string;
  gameId: string;
  matchId?: string;
  startsAt: Date;
  endsAt: Date;
  notes?: string;
}

/**
 * Booking lifecycle and commission calculation.
 *
 * Commission is computed at request time, snapshotted into
 * commissionPercentSnapshot, and stored as a separate `commissionAmount`
 * column even though it could be re-derived. Two reasons:
 *  1. Reporting / admin views read the materialized number directly.
 *  2. The rounding rule means re-derivation isn't necessarily exact, so the
 *     stored amount is the source of truth for what the venue agreed to pay.
 *
 * Concurrency: the SQL exclusion constraint catches double-booking races.
 * The service catches SQLSTATE 23P01 and re-throws VENUE_TIME_SLOT_UNAVAILABLE.
 *
 * Match association: when matchId is supplied, the corresponding match's
 * venueId is updated. On cancel/decline, it's reset to null. The match
 * domain doesn't push back — there's no two-way reservation; the booking
 * is the single source of truth for venue assignment.
 */
export class VenueBookingService {
  constructor(
    private readonly bookingRepo: IVenueBookingRepository,
    private readonly venueRepo: IVenueRepository,
    private readonly gameConfigRepo: IVenueGameConfigRepository,
    private readonly availabilityRepo: IVenueAvailabilityRepository,
    private readonly notificationService: NotificationService,
    private readonly paymentProvider: PaymentProvider,
  ) {}

  // ─── request ──────────────────────────────────────────────────────────────

  async requestBooking(input: RequestBookingInput, byUserId: string): Promise<VenueBooking> {
    if (input.endsAt <= input.startsAt) {
      throw new ValidationError('BOOKING_ENDS_BEFORE_STARTS');
    }
    return await transaction(async (client) => {
      const venue = await this.venueRepo.findActiveById(input.venueId, client);
      if (!venue) throw new NotFoundError('Venue');

      const config = await this.gameConfigRepo.findActiveByVenueAndGame(
        input.venueId, input.gameId, client,
      );
      if (!config) throw new NotFoundError('VenueGameConfig');

      // Duration bounds.
      const durationMinutes = Math.round(
        (input.endsAt.getTime() - input.startsAt.getTime()) / 60000,
      );
      if (config.minBookingMinutes != null && durationMinutes < config.minBookingMinutes) {
        throw new ValidationError('BOOKING_BELOW_MIN_DURATION');
      }
      if (config.maxBookingMinutes != null && durationMinutes > config.maxBookingMinutes) {
        throw new ValidationError('BOOKING_ABOVE_MAX_DURATION');
      }

      // Availability — both endpoints must fall inside open hours.
      // We check startsAt and (endsAt - 1ms) because endTime is exclusive on
      // the rule's [openTime, closeTime) window: a booking that ends at
      // exactly closeTime is allowed.
      await this.assertOpenAt(input.venueId, input.startsAt);
      await this.assertOpenAt(input.venueId, new Date(input.endsAt.getTime() - 1));

      // Price.
      const currency = await this.fetchCurrency(config.priceCurrency);
      const priceAmount = this.calculatePrice(
        config.pricingModel,
        config.priceAmount,
        durationMinutes,
        currency,
      );

      // Commission.
      const commissionPercent = await getConfigNumber('venue_commission_percent');
      const commission = calculateCommission({
        priceAmount,
        commissionPercent,
        currency,
      });

      let booking: VenueBooking;
      try {
        booking = await this.bookingRepo.create({
          venueId: input.venueId,
          matchId: input.matchId ?? null,
          gameId: input.gameId,
          requestedByUserId: byUserId,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          priceAmount,
          priceCurrency: config.priceCurrency,
          commissionAmount: commission.roundedCommission,
          commissionCurrency: config.priceCurrency,
          commissionPercentSnapshot: commissionPercent,
          notes: input.notes ?? null,
        }, client);
      } catch (err: unknown) {
        // SQLSTATE 23P01 = exclusion_violation; thrown by the GiST exclusion
        // constraint when the requested window overlaps an active booking.
        if (isPgError(err) && err.code === '23P01') {
          throw new ConflictError('VENUE_TIME_SLOT_UNAVAILABLE');
        }
        throw err;
      }

      // Bind to match if provided.
      if (input.matchId) {
        await client.query(
          `UPDATE matches SET "venueId" = :venueId WHERE id = :matchId`,
          { venueId: input.venueId, matchId: input.matchId },
        );
      }

      // Notify the venue owner.
      await this.notificationService.enqueue({
        userId: venue.ownerUserId,
        type: 'venue_booking_requested',
        payload: {
          bookingId: booking.id,
          venueId: input.venueId,
          startsAt: input.startsAt.toISOString(),
          endsAt: input.endsAt.toISOString(),
          requestedByUserId: byUserId,
        },
      }, client);

      return booking;
    });
  }

  // ─── confirm / decline / cancel / complete ───────────────────────────────

  async confirmBooking(bookingId: string, byOwnerUserId: string): Promise<VenueBooking> {
    return await transaction(async (client) => {
      const booking = await this.bookingRepo.findByIdForUpdate(bookingId, client);
      if (!booking) throw new NotFoundError('VenueBooking');
      if (booking.status !== 'requested') throw new ConflictError('BOOKING_NOT_REQUESTED');

      const venue = await this.venueRepo.findById(booking.venueId, client);
      if (!venue) throw new NotFoundError('Venue');
      if (venue.ownerUserId !== byOwnerUserId) {
        throw new AuthorizationError('NOT_VENUE_OWNER');
      }

      // Initiate payment via the configured provider. For ManualPaymentProvider
      // this is a stateless reference generator; nothing external happens.
      const intent = await this.paymentProvider.initiate({
        bookingId,
        amount: booking.priceAmount,
        currency: booking.priceCurrency,
        payerUserId: booking.requestedByUserId,
        recipientUserId: venue.ownerUserId,
        description: `Venue booking ${bookingId}`,
      });
      if (!intent.success) {
        throw new AppError(intent.errorMessage ?? 'Payment initiate failed', 502);
      }

      let updated = await this.bookingRepo.setStatus(bookingId, 'confirmed', client);
      if (intent.providerReference) {
        updated = await this.bookingRepo.attachPaymentReference(
          bookingId,
          this.paymentProvider.name,
          intent.providerReference,
          intent.status === 'paid' ? 'paid' : 'pending',
          client,
        );
      }

      await this.notificationService.enqueue({
        userId: booking.requestedByUserId,
        type: 'venue_booking_confirmed',
        payload: { bookingId, venueId: booking.venueId },
      }, client);

      return updated;
    });
  }

  async declineBooking(
    bookingId: string,
    byOwnerUserId: string,
    reason: string,
  ): Promise<VenueBooking> {
    return await transaction(async (client) => {
      const booking = await this.bookingRepo.findByIdForUpdate(bookingId, client);
      if (!booking) throw new NotFoundError('VenueBooking');
      if (booking.status !== 'requested') throw new ConflictError('BOOKING_NOT_REQUESTED');

      const venue = await this.venueRepo.findById(booking.venueId, client);
      if (!venue) throw new NotFoundError('Venue');
      if (venue.ownerUserId !== byOwnerUserId) {
        throw new AuthorizationError('NOT_VENUE_OWNER');
      }

      const updated = await this.bookingRepo.setStatus(
        bookingId, 'declined', client, { reason },
      );
      await this.detachFromMatchIfBound(booking, client);

      await this.notificationService.enqueue({
        userId: booking.requestedByUserId,
        type: 'venue_booking_declined',
        payload: { bookingId, venueId: booking.venueId, reason },
      }, client);
      return updated;
    });
  }

  async cancelBooking(
    bookingId: string,
    byUserId: string,
    reason?: string,
  ): Promise<VenueBooking> {
    return await transaction(async (client) => {
      const booking = await this.bookingRepo.findByIdForUpdate(bookingId, client);
      if (!booking) throw new NotFoundError('VenueBooking');
      if (booking.status !== 'requested' && booking.status !== 'confirmed') {
        throw new ConflictError('BOOKING_NOT_CANCELLABLE');
      }
      const venue = await this.venueRepo.findById(booking.venueId, client);
      if (!venue) throw new NotFoundError('Venue');
      // Either the requester or the owner can cancel.
      if (booking.requestedByUserId !== byUserId && venue.ownerUserId !== byUserId) {
        throw new AuthorizationError('NOT_BOOKING_PARTY');
      }

      let updated = await this.bookingRepo.setStatus(
        bookingId, 'cancelled', client,
        { reason: reason ?? null, cancelledByUserId: byUserId },
      );

      // If the booking was already paid, mark it for refund (admin processes).
      if (booking.paymentStatus === 'paid') {
        updated = await this.bookingRepo.setPaymentStatus(bookingId, 'refunded', client);
      }

      await this.detachFromMatchIfBound(booking, client);

      const otherParty = booking.requestedByUserId === byUserId
        ? venue.ownerUserId
        : booking.requestedByUserId;
      await this.notificationService.enqueue({
        userId: otherParty,
        type: 'venue_booking_cancelled',
        payload: { bookingId, venueId: booking.venueId, reason: reason ?? null },
      }, client);
      return updated;
    });
  }

  async completeBooking(bookingId: string, byUserId: string): Promise<VenueBooking> {
    return await transaction(async (client) => {
      const booking = await this.bookingRepo.findByIdForUpdate(bookingId, client);
      if (!booking) throw new NotFoundError('VenueBooking');
      if (booking.status !== 'confirmed') throw new ConflictError('BOOKING_NOT_CONFIRMED');

      const venue = await this.venueRepo.findById(booking.venueId, client);
      if (!venue) throw new NotFoundError('Venue');
      // Owner OR admin can complete; admin path is checked via the role lookup.
      if (venue.ownerUserId !== byUserId && !(await this.isAdmin(byUserId))) {
        throw new AuthorizationError('NOT_AUTHORIZED_TO_COMPLETE');
      }

      return this.bookingRepo.setStatus(bookingId, 'completed', client);
    });
  }

  async markBookingPaid(
    bookingId: string,
    providerReference: string | null,
    byAdminUserId: string,
  ): Promise<VenueBooking> {
    if (!(await this.isAdmin(byAdminUserId))) {
      throw new AuthorizationError('NOT_ADMIN');
    }
    return await transaction(async (client) => {
      const booking = await this.bookingRepo.findByIdForUpdate(bookingId, client);
      if (!booking) throw new NotFoundError('VenueBooking');
      if (booking.paymentStatus === 'paid') return booking;
      const ref = providerReference ?? booking.paymentProviderReference ?? `manual-${bookingId}`;
      const result = await this.paymentProvider.markPaid?.(ref, byAdminUserId);
      if (result && !result.success) {
        throw new AppError(result.errorMessage ?? 'Mark paid failed', 502);
      }
      return this.bookingRepo.setPaymentStatus(bookingId, 'paid', client, ref);
    });
  }

  // ─── reads ────────────────────────────────────────────────────────────────

  async getById(bookingId: string, byUserId: string): Promise<VenueBooking> {
    const booking = await this.bookingRepo.findById(bookingId);
    if (!booking) throw new NotFoundError('VenueBooking');
    const venue = await this.venueRepo.findById(booking.venueId);
    if (!venue) throw new NotFoundError('Venue');
    if (
      booking.requestedByUserId !== byUserId
      && venue.ownerUserId !== byUserId
      && !(await this.isAdmin(byUserId))
    ) {
      throw new AuthorizationError('NOT_BOOKING_PARTY');
    }
    return booking;
  }

  async getMyBookings(
    userId: string,
    statusFilter?: VenueBookingStatus,
  ): Promise<VenueBooking[]> {
    return this.bookingRepo.findManyByRequester(userId, statusFilter);
  }

  async getVenueBookings(
    venueId: string,
    byUserId: string,
    statusFilter?: VenueBookingStatus,
  ): Promise<VenueBooking[]> {
    const venue = await this.venueRepo.findById(venueId);
    if (!venue) throw new NotFoundError('Venue');
    if (venue.ownerUserId !== byUserId && !(await this.isAdmin(byUserId))) {
      throw new AuthorizationError('NOT_VENUE_OWNER');
    }
    return this.bookingRepo.findManyByVenue(venueId, statusFilter);
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  /**
   * Compute booking price from the venue's game config + duration. Hourly
   * rates round per the currency rules at the end so we can't accidentally
   * charge a fraction of a qirsh.
   */
  private calculatePrice(
    pricingModel: 'hourly' | 'per_game' | 'per_session',
    unitPrice: number,
    durationMinutes: number,
    currency: Currency,
  ): number {
    if (pricingModel === 'hourly') {
      const hours = durationMinutes / 60;
      return roundMoney(unitPrice * hours, currency);
    }
    return unitPrice; // per_game and per_session are flat
  }

  private async assertOpenAt(venueId: string, timestamp: Date): Promise<void> {
    const dow = timestamp.getUTCDay();
    const rules = await this.availabilityRepo.findRulesByVenueAndDay(venueId, dow);
    const blackouts = await this.availabilityRepo.findBlackoutsByVenueInRange(
      venueId,
      new Date(timestamp.getTime() - 1),
      new Date(timestamp.getTime() + 1),
    );
    const result = checkAvailability(timestamp, rules, blackouts);
    if (!result.isOpen) {
      throw new ConflictError(`VENUE_NOT_OPEN_${result.reason?.toUpperCase() ?? 'UNKNOWN'}`);
    }
  }

  private async detachFromMatchIfBound(
    booking: VenueBooking,
    client: CustomClient,
  ): Promise<void> {
    if (!booking.matchId) return;
    await client.query(
      `UPDATE matches SET "venueId" = NULL
       WHERE id = :matchId AND "venueId" = :venueId`,
      { matchId: booking.matchId, venueId: booking.venueId },
    );
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

  private async fetchCurrency(code: string): Promise<Currency> {
    const [row] = await query<Currency>(
      `SELECT code, name, "nameAr", symbol,
              "subunitFactor", "displayRoundingStep", "displayRoundingMode",
              "isActive"
       FROM currencies WHERE code = :code`,
      { code },
    );
    if (!row) throw new ValidationError('CURRENCY_NOT_FOUND');
    if (!row.isActive) throw new ValidationError('CURRENCY_INACTIVE');
    return row;
  }
}
