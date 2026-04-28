import { describe, it, expect } from 'vitest';
import { seedFromExperience } from './seed.js';
import type { SeedThresholds } from './types.js';

const T: SeedThresholds = {
  beginner: 800,
  intermediate: 1000,
  advanced: 1200,
  expert: 1400,
};

describe('seedFromExperience', () => {
  it.each([
    ['beginner',     800],
    ['intermediate', 1000],
    ['advanced',     1200],
    ['expert',       1400],
  ] as const)('seeds %s at %d', (level, expected) => {
    const out = seedFromExperience(level, T);
    expect(out.elo).toBe(expected);
    expect(out.mmr).toBe(expected);
  });

  it('null/undefined falls back to intermediate', () => {
    expect(seedFromExperience(null, T)).toEqual({ elo: 1000, mmr: 1000 });
    expect(seedFromExperience(undefined, T)).toEqual({ elo: 1000, mmr: 1000 });
  });

  it('elo and mmr seed at the same value', () => {
    const out = seedFromExperience('expert', T);
    expect(out.elo).toBe(out.mmr);
  });
});
