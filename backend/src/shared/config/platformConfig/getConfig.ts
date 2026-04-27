/**
 * Typed reader for platformConfig values.
 *
 * No caching: every call hits the DB. A read-through cache with TTL would speed
 * this up, but invalidation becomes tricky once the admin dashboard can edit
 * config values (Phase 8). We'll add caching after that work lands so the cache
 * can be flushed correctly when admins make changes.
 */
import { query } from '../../../db';
import { AppError } from '../../errors';

interface PlatformConfigRow {
  key: string;
  value: unknown; // JSONB returns parsed JS values from pg
  valueType: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
}

async function fetchRow(key: string): Promise<PlatformConfigRow> {
  const [row] = await query<PlatformConfigRow>(
    `SELECT key, value, "valueType" FROM "platformConfig" WHERE key = :key`,
    { key },
  );
  if (!row) {
    throw new AppError(`Platform config key not found: ${key}`, 500, 'PLATFORM_CONFIG_MISSING');
  }
  return row;
}

function assertType(row: PlatformConfigRow, expected: PlatformConfigRow['valueType']): void {
  if (row.valueType !== expected) {
    throw new AppError(
      `Platform config key "${row.key}" is type "${row.valueType}", not "${expected}"`,
      500,
      'PLATFORM_CONFIG_TYPE_MISMATCH',
    );
  }
}

// Each typed reader below uses `as <T>` AFTER a runtime `assertType` (or equivalent inline
// check) that throws on mismatch. The cast is post-check narrowing — the only way to
// inform TypeScript of a runtime invariant on `row.value` (which is JSONB / unknown).

export async function getConfig<T = unknown>(key: string): Promise<T> {
  const row = await fetchRow(key);
  return row.value as T;
}

export async function getConfigBoolean(key: string): Promise<boolean> {
  const row = await fetchRow(key);
  assertType(row, 'boolean');
  return row.value as boolean;
}

export async function getConfigNumber(key: string): Promise<number> {
  const row = await fetchRow(key);
  if (row.valueType !== 'number' && row.valueType !== 'integer') {
    throw new AppError(
      `Platform config key "${row.key}" is type "${row.valueType}", not number/integer`,
      500,
      'PLATFORM_CONFIG_TYPE_MISMATCH',
    );
  }
  return row.value as number;
}

export async function getConfigInteger(key: string): Promise<number> {
  const row = await fetchRow(key);
  assertType(row, 'integer');
  return row.value as number;
}

export async function getConfigString(key: string): Promise<string> {
  const row = await fetchRow(key);
  assertType(row, 'string');
  return row.value as string;
}

export async function getConfigArray<T = unknown>(key: string): Promise<T[]> {
  const row = await fetchRow(key);
  assertType(row, 'array');
  return row.value as T[];
}

export async function getConfigObject<T = unknown>(key: string): Promise<T> {
  const row = await fetchRow(key);
  assertType(row, 'object');
  return row.value as T;
}
