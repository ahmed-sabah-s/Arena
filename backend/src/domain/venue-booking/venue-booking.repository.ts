import pg from 'pg';
import { query } from '../../db.js';
import type { CustomClient } from '../../db.js';
import { AppError, NotFoundError } from '../../shared/errors/index.js';
import type {
  VenueBooking,
  VenueBookingStatus,
  VenuePaymentStatus,
} from './venue-booking.entity.js';
import type {
  CreateVenueBookingData,
  IVenueBookingRepository,
  SetBookingStatusExtras,
} from './venue-booking.interface.js';

async function exec<T extends pg.QueryResultRow>(
  client: CustomClient | undefined,
  sql: string,
  params: Record<string, unknown>,
): Promise<T[]> {
  if (client) {
    const res = await client.query<T>(sql, params);
    return res.rows;
  }
  return query<T>(sql, params);
}

// pg returns BIGINT and DECIMAL columns as strings; coerce numeric fields on read.
type BookingRow = Omit<
  VenueBooking,
  'priceAmount' | 'commissionAmount' | 'commissionPercentSnapshot'
> & {
  priceAmount: string | number;
  commissionAmount: string | number;
  commissionPercentSnapshot: string | number;
};

function toNumber(v: string | number): number {
  return typeof v === 'string' ? Number.parseFloat(v) : v;
}

function normaliseBooking(row: BookingRow): VenueBooking {
  return {
    ...row,
    priceAmount: toNumber(row.priceAmount),
    commissionAmount: toNumber(row.commissionAmount),
    commissionPercentSnapshot: toNumber(row.commissionPercentSnapshot),
  };
}

export class VenueBookingRepository implements IVenueBookingRepository {
  async create(input: CreateVenueBookingData, client: CustomClient): Promise<VenueBooking> {
    const rows = await exec<BookingRow>(
      client,
      `INSERT INTO "venueBookings" (
         "venueId", "matchId", "gameId", "requestedByUserId",
         "startsAt", "endsAt",
         "priceAmount", "priceCurrency",
         "commissionAmount", "commissionCurrency", "commissionPercentSnapshot",
         notes
       )
       VALUES (
         :venueId, :matchId, :gameId, :requestedByUserId,
         :startsAt, :endsAt,
         :priceAmount, :priceCurrency,
         :commissionAmount, :commissionCurrency, :commissionPercentSnapshot,
         :notes
       )
       RETURNING *`,
      { ...input },
    );
    if (!rows[0]) throw new AppError('Failed to create booking', 500);
    return normaliseBooking(rows[0]);
  }

  async findById(id: string, client?: CustomClient): Promise<VenueBooking | null> {
    const rows = await exec<BookingRow>(
      client,
      `SELECT * FROM "venueBookings" WHERE id = :id`,
      { id },
    );
    return rows[0] ? normaliseBooking(rows[0]) : null;
  }

  async findByIdForUpdate(id: string, client: CustomClient): Promise<VenueBooking | null> {
    const res = await client.query<BookingRow>(
      `SELECT * FROM "venueBookings" WHERE id = :id FOR UPDATE`,
      { id },
    );
    return res.rows[0] ? normaliseBooking(res.rows[0]) : null;
  }

  async findManyByVenue(
    venueId: string,
    statusFilter?: VenueBookingStatus,
  ): Promise<VenueBooking[]> {
    const rows = statusFilter
      ? await query<BookingRow>(
          `SELECT * FROM "venueBookings"
           WHERE "venueId" = :venueId AND status = :status
           ORDER BY "startsAt" DESC`,
          { venueId, status: statusFilter },
        )
      : await query<BookingRow>(
          `SELECT * FROM "venueBookings"
           WHERE "venueId" = :venueId
           ORDER BY "startsAt" DESC`,
          { venueId },
        );
    return rows.map(normaliseBooking);
  }

  async findManyByRequester(
    userId: string,
    statusFilter?: VenueBookingStatus,
  ): Promise<VenueBooking[]> {
    const rows = statusFilter
      ? await query<BookingRow>(
          `SELECT * FROM "venueBookings"
           WHERE "requestedByUserId" = :userId AND status = :status
           ORDER BY "startsAt" DESC`,
          { userId, status: statusFilter },
        )
      : await query<BookingRow>(
          `SELECT * FROM "venueBookings"
           WHERE "requestedByUserId" = :userId
           ORDER BY "startsAt" DESC`,
          { userId },
        );
    return rows.map(normaliseBooking);
  }

  async findOverlappingActive(
    venueId: string,
    startsAt: Date,
    endsAt: Date,
    client?: CustomClient,
  ): Promise<VenueBooking[]> {
    const rows = await exec<BookingRow>(
      client,
      `SELECT * FROM "venueBookings"
       WHERE "venueId" = :venueId
         AND status IN ('requested', 'confirmed')
         AND "startsAt" < :endsAt
         AND "endsAt" > :startsAt
       ORDER BY "startsAt" ASC`,
      { venueId, startsAt, endsAt },
    );
    return rows.map(normaliseBooking);
  }

  async setStatus(
    id: string,
    status: VenueBookingStatus,
    client: CustomClient,
    extras?: SetBookingStatusExtras,
  ): Promise<VenueBooking> {
    const sets: string[] = [`status = :status`];
    const params: Record<string, unknown> = { id, status };
    const now = new Date();
    if (status === 'confirmed') {
      sets.push(`"confirmedAt" = :now`);
      params.now = now;
    } else if (status === 'declined') {
      sets.push(`"declinedAt" = :now`, `"declineReason" = :reason`);
      params.now = now;
      params.reason = extras?.reason ?? null;
    } else if (status === 'cancelled') {
      sets.push(`"cancelledAt" = :now`, `"cancelReason" = :reason`);
      params.now = now;
      params.reason = extras?.reason ?? null;
      if (extras?.cancelledByUserId) {
        sets.push(`"cancelledByUserId" = :cancelledByUserId`);
        params.cancelledByUserId = extras.cancelledByUserId;
      }
    } else if (status === 'completed') {
      sets.push(`"completedAt" = :now`);
      params.now = now;
    }
    if (extras?.paymentStatus) {
      sets.push(`"paymentStatus" = :paymentStatus`);
      params.paymentStatus = extras.paymentStatus;
    }
    const res = await client.query<BookingRow>(
      `UPDATE "venueBookings" SET ${sets.join(', ')} WHERE id = :id RETURNING *`,
      params,
    );
    const row = res.rows[0];
    if (!row) throw new NotFoundError('VenueBooking');
    return normaliseBooking(row);
  }

  async attachPaymentReference(
    id: string,
    provider: string,
    providerReference: string,
    paymentStatus: VenuePaymentStatus,
    client: CustomClient,
  ): Promise<VenueBooking> {
    const res = await client.query<BookingRow>(
      `UPDATE "venueBookings"
       SET "paymentProvider" = :provider,
           "paymentProviderReference" = :providerReference,
           "paymentStatus" = :paymentStatus
       WHERE id = :id
       RETURNING *`,
      { id, provider, providerReference, paymentStatus },
    );
    const row = res.rows[0];
    if (!row) throw new NotFoundError('VenueBooking');
    return normaliseBooking(row);
  }

  async setPaymentStatus(
    id: string,
    paymentStatus: VenuePaymentStatus,
    client: CustomClient,
    providerReference?: string,
  ): Promise<VenueBooking> {
    const sets: string[] = [`"paymentStatus" = :paymentStatus`];
    const params: Record<string, unknown> = { id, paymentStatus };
    if (providerReference) {
      sets.push(`"paymentProviderReference" = :providerReference`);
      params.providerReference = providerReference;
    }
    const res = await client.query<BookingRow>(
      `UPDATE "venueBookings" SET ${sets.join(', ')} WHERE id = :id RETURNING *`,
      params,
    );
    const row = res.rows[0];
    if (!row) throw new NotFoundError('VenueBooking');
    return normaliseBooking(row);
  }
}
