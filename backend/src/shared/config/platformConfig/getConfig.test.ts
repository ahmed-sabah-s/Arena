import { describe, it, expect, afterAll } from 'vitest';
import {
  getConfig,
  getConfigBoolean,
  getConfigInteger,
  getConfigNumber,
  getConfigString,
  getConfigArray,
} from './getConfig.js';
import { closePool } from '../../../db.js';

// These tests hit the actual seeded platformConfig rows.
// They require a migrated + seeded database — `pnpm db:reset` before running.

describe('getConfig (live DB)', () => {
  afterAll(async () => {
    await closePool();
  });

  it('returns an integer for an integer key', async () => {
    const v = await getConfigInteger('otp_expiry_minutes');
    expect(v).toBe(5);
  });

  it('returns a boolean for a boolean key', async () => {
    const v = await getConfigBoolean('public_leaderboard_enabled');
    expect(v).toBe(true);
  });

  it('returns a string for a string key', async () => {
    const v = await getConfigString('default_currency');
    expect(v).toBe('IQD');
  });

  it('returns a number (float) for a number key via getConfigNumber', async () => {
    const v = await getConfigNumber('venue_commission_percent');
    expect(v).toBeCloseTo(8.0);
  });

  it('getConfigNumber accepts integer-typed rows too', async () => {
    const v = await getConfigNumber('otp_expiry_minutes');
    expect(v).toBe(5);
  });

  it('returns an array for an array key', async () => {
    const v = await getConfigArray<string>('supported_currencies');
    expect(v).toEqual(['IQD']);
  });

  it('generic getConfig returns the parsed JSONB value', async () => {
    const v = await getConfig<string>('default_currency');
    expect(v).toBe('IQD');
  });

  it('throws on type mismatch (boolean asked for integer key)', async () => {
    await expect(getConfigBoolean('otp_expiry_minutes')).rejects.toThrow(/type/);
  });

  it('throws on missing key', async () => {
    await expect(getConfigInteger('does_not_exist__xyz')).rejects.toThrow(/not found/);
  });
});
