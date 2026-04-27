/**
 * Integration test setup. Loaded by vitest.config.integration.ts.
 *
 * Provides:
 *   - getTestPool()        — pg Pool against TEST_DATABASE_URL
 *   - withTestTransaction  — wrap a test in BEGIN/ROLLBACK so writes auto-clean
 *   - truncateTables       — explicit cleanup for tests that need to commit
 *
 * Choosing between withTestTransaction vs truncateTables:
 *
 *   USE withTestTransaction WHEN:
 *     - The test only reads, or writes that don't need to be visible to a separate connection.
 *     - The service under test does not run its own transaction (which would conflict with ours).
 *
 *   USE truncateTables(...names) IN afterEach WHEN:
 *     - The service under test calls our `transaction()` helper internally.
 *       Postgres doesn't support nested transactions; rolling back a parent transaction
 *       around a service that opens its own won't work cleanly.
 *     - The test asserts on post-commit state (e.g., partial unique index violations,
 *       constraint behavior that fires at COMMIT time).
 *
 * The test DB is migrated once on first import. Subsequent test files reuse the same schema.
 */
import 'dotenv/config';
import { beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;
if (!TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must be set in env for integration tests');
}
if (TEST_DATABASE_URL === ORIGINAL_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must not equal DATABASE_URL — tests would destroy dev data');
}

// CRITICAL: redirect the application's DATABASE_URL to the test DB BEFORE any
// service module is imported. The pool in src/db.ts captures DATABASE_URL at
// module-load time, so services pulled in after this point will use the test pool.
process.env.DATABASE_URL = TEST_DATABASE_URL;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../../database/migrations');

// ─── CustomClient mirrors backend/src/db.ts behavior with named params ────────
// We intentionally don't import from src/db.ts because that module reads
// DATABASE_URL at import time, which would point at the dev DB during tests.

class TestClient extends pg.Client {
  override async query(textOrConfig: any, paramsOrValues?: any): Promise<any> {
    if (
      typeof textOrConfig === 'string' &&
      paramsOrValues !== undefined &&
      !Array.isArray(paramsOrValues)
    ) {
      const m = new Map<string, number>();
      const converted = textOrConfig.replace(
        /(?<!:):([a-zA-Z0-9_]+)/g,
        (_: string, key: string) => {
          if (paramsOrValues[key] === undefined) {
            throw new Error(`Missing parameter: ${key}`);
          }
          m.set(key, m.get(key) ?? m.size + 1);
          return `$${m.get(key)}`;
        },
      );
      const values = [...m.keys()].map((k) => paramsOrValues[k]);
      return super.query(converted, values);
    }
    return super.query(textOrConfig, paramsOrValues);
  }
}

let testPool: pg.Pool | null = null;

export function getTestPool(): pg.Pool {
  if (!testPool) {
    testPool = new pg.Pool({
      connectionString: TEST_DATABASE_URL,
      max: 5,
    });
  }
  return testPool;
}

export async function closeTestPool(): Promise<void> {
  if (testPool) {
    await testPool.end();
    testPool = null;
  }
}

let migrationsApplied = false;

async function applyMigrationsOnce(): Promise<void> {
  if (migrationsApplied) return;

  const pool = getTestPool();
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

  // Reset schema before applying — ensures a clean state per test process.
  await pool.query(`
    DROP SCHEMA IF EXISTS public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO public;
  `);

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    await pool.query(sql);
  }

  migrationsApplied = true;
}

beforeAll(async () => {
  await applyMigrationsOnce();
});

/**
 * Run a test inside a BEGIN/ROLLBACK transaction. All writes auto-roll-back.
 * Use this when the service under test does NOT call our `transaction()` helper.
 */
export async function withTestTransaction<T>(
  fn: (client: TestClient) => Promise<T>,
): Promise<T> {
  const client = new TestClient({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('ROLLBACK');
    return result;
  } finally {
    await client.end();
  }
}

/**
 * Truncate the listed tables. Use in afterEach for tests where the service
 * under test runs its own transaction (so we cannot wrap them in BEGIN/ROLLBACK).
 *
 * Truncate order matters when foreign keys reference each other; passing tables
 * with `RESTART IDENTITY CASCADE` lets Postgres handle the dependency graph.
 */
export async function truncateTables(...names: string[]): Promise<void> {
  if (names.length === 0) return;
  const pool = getTestPool();
  const quoted = names.map((n) => `"${n}"`).join(', ');
  await pool.query(`TRUNCATE ${quoted} RESTART IDENTITY CASCADE`);
}

/**
 * Test helper: insert a user via raw SQL, returning the new id.
 * Bypasses the regular UserRepository so we can quickly seed test fixtures.
 */
export async function createTestUser(
  overrides: Partial<{
    phone: string;
    fullName: string;
    gender: 'male' | 'female' | 'prefer_not_say' | null;
    city: string | null;
    country: string;
    experienceLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert' | null;
  }> = {},
): Promise<{ id: string; phone: string; fullName: string }> {
  const pool = getTestPool();
  const phone = overrides.phone ?? `+9647500099${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
  const fullName = overrides.fullName ?? 'Test User';
  const result = await pool.query<{ id: string }>(
    `INSERT INTO "user" (phone, "fullName", gender, city, country, "preferredLanguage", "preferredCurrency", "phoneVerifiedAt", "onboardingCompletedAt")
     VALUES ($1, $2, $3, $4, COALESCE($5, 'IQ'), 'ar', 'IQD', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     RETURNING id`,
    [phone, fullName, overrides.gender ?? 'male', overrides.city ?? 'Baghdad', overrides.country ?? 'IQ'],
  );
  return { id: result.rows[0].id, phone, fullName };
}
