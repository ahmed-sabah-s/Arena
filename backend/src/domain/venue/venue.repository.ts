import pg from 'pg';
import { query } from '../../db.js';
import type { CustomClient } from '../../db.js';
import { AppError, NotFoundError } from '../../shared/errors/index.js';
import type {
  Venue,
  VenueAvailabilityBlackout,
  VenueAvailabilityRule,
  VenueGameConfig,
  VenueStatus,
} from './venue.entity.js';
import type {
  AddAvailabilityRuleData,
  AddBlackoutData,
  CreateVenueData,
  IVenueAvailabilityRepository,
  IVenueGameConfigRepository,
  IVenueRepository,
  UpdateVenueData,
  UpsertVenueGameConfigData,
} from './venue.interface.js';

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

// pg returns DECIMAL as string; coerce numeric venue columns on read.
type VenueRow = Omit<Venue, 'latitude' | 'longitude'> & {
  latitude: string | number | null;
  longitude: string | number | null;
};

function normaliseVenue(row: VenueRow): Venue {
  return {
    ...row,
    latitude: row.latitude == null
      ? null
      : typeof row.latitude === 'string' ? Number.parseFloat(row.latitude) : row.latitude,
    longitude: row.longitude == null
      ? null
      : typeof row.longitude === 'string' ? Number.parseFloat(row.longitude) : row.longitude,
  };
}

// ─── Venue ──────────────────────────────────────────────────────────────────

export class VenueRepository implements IVenueRepository {
  async create(input: CreateVenueData, client?: CustomClient): Promise<Venue> {
    const rows = await exec<VenueRow>(
      client,
      `INSERT INTO venues (
         "ownerUserId", name, "nameAr", description,
         city, district, address,
         latitude, longitude, country, "defaultCurrency",
         "contactPhone", "contactEmail", "primaryPhotoFileId"
       )
       VALUES (
         :ownerUserId, :name, :nameAr, :description,
         :city, :district, :address,
         :latitude, :longitude, :country, :defaultCurrency,
         :contactPhone, :contactEmail, :primaryPhotoFileId
       )
       RETURNING *`,
      { ...input },
    );
    if (!rows[0]) throw new AppError('Failed to create venue', 500);
    return normaliseVenue(rows[0]);
  }

  async findById(id: string, client?: CustomClient): Promise<Venue | null> {
    const rows = await exec<VenueRow>(
      client,
      `SELECT * FROM venues WHERE id = :id AND "deletedAt" IS NULL`,
      { id },
    );
    return rows[0] ? normaliseVenue(rows[0]) : null;
  }

  async findActiveById(id: string, client?: CustomClient): Promise<Venue | null> {
    const rows = await exec<VenueRow>(
      client,
      `SELECT * FROM venues
       WHERE id = :id AND status = 'active' AND "deletedAt" IS NULL`,
      { id },
    );
    return rows[0] ? normaliseVenue(rows[0]) : null;
  }

  async findManyByOwner(ownerUserId: string): Promise<Venue[]> {
    const rows = await query<VenueRow>(
      `SELECT * FROM venues
       WHERE "ownerUserId" = :ownerUserId AND "deletedAt" IS NULL
       ORDER BY "createdAt" DESC`,
      { ownerUserId },
    );
    return rows.map(normaliseVenue);
  }

  async findActiveInCity(city: string): Promise<Venue[]> {
    const rows = await query<VenueRow>(
      `SELECT * FROM venues
       WHERE city = :city AND status = 'active' AND "deletedAt" IS NULL
       ORDER BY name ASC`,
      { city },
    );
    return rows.map(normaliseVenue);
  }

  async update(id: string, partial: UpdateVenueData, client?: CustomClient): Promise<Venue> {
    const sets: string[] = [];
    const params: Record<string, unknown> = { id };
    const map: Record<string, string> = {
      name: 'name',
      nameAr: '"nameAr"',
      description: 'description',
      city: 'city',
      district: 'district',
      address: 'address',
      latitude: 'latitude',
      longitude: 'longitude',
      contactPhone: '"contactPhone"',
      contactEmail: '"contactEmail"',
      primaryPhotoFileId: '"primaryPhotoFileId"',
    };
    for (const [k, col] of Object.entries(map)) {
      const v = (partial as Record<string, unknown>)[k];
      if (v !== undefined) {
        sets.push(`${col} = :${k}`);
        params[k] = v;
      }
    }
    if (sets.length === 0) {
      const existing = await this.findById(id, client);
      if (!existing) throw new NotFoundError('Venue');
      return existing;
    }
    const rows = await exec<VenueRow>(
      client,
      `UPDATE venues SET ${sets.join(', ')}
       WHERE id = :id AND "deletedAt" IS NULL
       RETURNING *`,
      params,
    );
    if (!rows[0]) throw new NotFoundError('Venue');
    return normaliseVenue(rows[0]);
  }

  async setStatus(
    id: string,
    status: VenueStatus,
    byUserId: string,
    extras: { approvedAt?: Date; rejectionReason?: string | null },
    client?: CustomClient,
  ): Promise<Venue> {
    const sets: string[] = [`status = :status`];
    const params: Record<string, unknown> = { id, status };
    if (status === 'active' && extras.approvedAt) {
      sets.push(`"approvedAt" = :approvedAt`, `"approvedByUserId" = :byUserId`);
      params.approvedAt = extras.approvedAt;
      params.byUserId = byUserId;
    }
    if (status === 'rejected') {
      sets.push(`"rejectionReason" = :rejectionReason`);
      params.rejectionReason = extras.rejectionReason ?? null;
    }
    const rows = await exec<VenueRow>(
      client,
      `UPDATE venues SET ${sets.join(', ')}
       WHERE id = :id AND "deletedAt" IS NULL
       RETURNING *`,
      params,
    );
    if (!rows[0]) throw new NotFoundError('Venue');
    return normaliseVenue(rows[0]);
  }

  async softDelete(id: string, client?: CustomClient): Promise<void> {
    await exec(
      client,
      `UPDATE venues SET "deletedAt" = CURRENT_TIMESTAMP WHERE id = :id`,
      { id },
    );
  }
}

// ─── Game Config ────────────────────────────────────────────────────────────

// pg returns BIGINT priceAmount as string; coerce on read.
type VenueGameConfigRow = Omit<VenueGameConfig, 'priceAmount'> & {
  priceAmount: string | number;
};

function normaliseVenueGameConfig(row: VenueGameConfigRow): VenueGameConfig {
  return {
    ...row,
    priceAmount: typeof row.priceAmount === 'string'
      ? Number.parseFloat(row.priceAmount)
      : row.priceAmount,
  };
}

export class VenueGameConfigRepository implements IVenueGameConfigRepository {
  async upsert(input: UpsertVenueGameConfigData, client?: CustomClient): Promise<VenueGameConfig> {
    const rows = await exec<VenueGameConfigRow>(
      client,
      `INSERT INTO "venueGameConfigs" (
         "venueId", "gameId", "pricingModel", "priceAmount", "priceCurrency",
         "minBookingMinutes", "maxBookingMinutes", capacity, "isActive"
       )
       VALUES (
         :venueId, :gameId, :pricingModel, :priceAmount, :priceCurrency,
         :minBookingMinutes, :maxBookingMinutes, :capacity, :isActive
       )
       ON CONFLICT ("venueId", "gameId") DO UPDATE SET
         "pricingModel" = EXCLUDED."pricingModel",
         "priceAmount" = EXCLUDED."priceAmount",
         "priceCurrency" = EXCLUDED."priceCurrency",
         "minBookingMinutes" = EXCLUDED."minBookingMinutes",
         "maxBookingMinutes" = EXCLUDED."maxBookingMinutes",
         capacity = EXCLUDED.capacity,
         "isActive" = EXCLUDED."isActive"
       RETURNING *`,
      { ...input },
    );
    if (!rows[0]) throw new AppError('Failed to upsert venue game config', 500);
    return normaliseVenueGameConfig(rows[0]);
  }

  async findByVenue(venueId: string): Promise<VenueGameConfig[]> {
    const rows = await query<VenueGameConfigRow>(
      `SELECT * FROM "venueGameConfigs"
       WHERE "venueId" = :venueId
       ORDER BY "createdAt" ASC`,
      { venueId },
    );
    return rows.map(normaliseVenueGameConfig);
  }

  async findActiveByVenueAndGame(
    venueId: string,
    gameId: string,
    client?: CustomClient,
  ): Promise<VenueGameConfig | null> {
    const rows = await exec<VenueGameConfigRow>(
      client,
      `SELECT * FROM "venueGameConfigs"
       WHERE "venueId" = :venueId AND "gameId" = :gameId AND "isActive" = true
       LIMIT 1`,
      { venueId, gameId },
    );
    return rows[0] ? normaliseVenueGameConfig(rows[0]) : null;
  }
}

// ─── Availability ───────────────────────────────────────────────────────────

export class VenueAvailabilityRepository implements IVenueAvailabilityRepository {
  async addRule(input: AddAvailabilityRuleData, client?: CustomClient): Promise<VenueAvailabilityRule> {
    const rows = await exec<VenueAvailabilityRule>(
      client,
      `INSERT INTO "venueAvailabilityRules" (
         "venueId", "dayOfWeek", "openTime", "closeTime"
       )
       VALUES (:venueId, :dayOfWeek, :openTime, :closeTime)
       RETURNING *`,
      { ...input },
    );
    if (!rows[0]) throw new AppError('Failed to add availability rule', 500);
    return rows[0];
  }

  async deleteRule(id: string, client?: CustomClient): Promise<void> {
    await exec(client, `DELETE FROM "venueAvailabilityRules" WHERE id = :id`, { id });
  }

  async findRulesByVenue(venueId: string, client?: CustomClient): Promise<VenueAvailabilityRule[]> {
    return exec<VenueAvailabilityRule>(
      client,
      `SELECT * FROM "venueAvailabilityRules"
       WHERE "venueId" = :venueId
       ORDER BY "dayOfWeek" ASC, "openTime" ASC`,
      { venueId },
    );
  }

  async findRulesByVenueAndDay(
    venueId: string,
    dayOfWeek: number,
    client?: CustomClient,
  ): Promise<VenueAvailabilityRule[]> {
    return exec<VenueAvailabilityRule>(
      client,
      `SELECT * FROM "venueAvailabilityRules"
       WHERE "venueId" = :venueId AND "dayOfWeek" = :dayOfWeek AND "isActive" = true
       ORDER BY "openTime" ASC`,
      { venueId, dayOfWeek },
    );
  }

  async addBlackout(input: AddBlackoutData, client?: CustomClient): Promise<VenueAvailabilityBlackout> {
    const rows = await exec<VenueAvailabilityBlackout>(
      client,
      `INSERT INTO "venueAvailabilityBlackouts" (
         "venueId", "startsAt", "endsAt", reason, "createdByUserId"
       )
       VALUES (:venueId, :startsAt, :endsAt, :reason, :createdByUserId)
       RETURNING *`,
      { ...input },
    );
    if (!rows[0]) throw new AppError('Failed to add blackout', 500);
    return rows[0];
  }

  async deleteBlackout(id: string, client?: CustomClient): Promise<void> {
    await exec(client, `DELETE FROM "venueAvailabilityBlackouts" WHERE id = :id`, { id });
  }

  async findBlackoutsByVenueInRange(
    venueId: string,
    startsAt: Date,
    endsAt: Date,
    client?: CustomClient,
  ): Promise<VenueAvailabilityBlackout[]> {
    // Overlap: rule.startsAt < endsAt AND rule.endsAt > startsAt
    return exec<VenueAvailabilityBlackout>(
      client,
      `SELECT * FROM "venueAvailabilityBlackouts"
       WHERE "venueId" = :venueId
         AND "startsAt" < :endsAt
         AND "endsAt" > :startsAt
       ORDER BY "startsAt" ASC`,
      { venueId, startsAt, endsAt },
    );
  }
}
