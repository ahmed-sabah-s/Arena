import { describe, it, expect } from 'vitest';
import { calculateTier } from './tier.js';
import type { TierThresholds } from './types.js';

const T: TierThresholds = {
  bronze: 0,
  silver: 1000,
  gold: 1300,
  platinum: 1600,
  elite: 1900,
};

describe('calculateTier', () => {
  it('returns bronze below silver', () => {
    expect(calculateTier(0, T)).toBe('bronze');
    expect(calculateTier(999, T)).toBe('bronze');
  });

  it('boundary: exactly at silver threshold is silver', () => {
    expect(calculateTier(1000, T)).toBe('silver');
  });

  it('boundary: exactly at gold threshold is gold', () => {
    expect(calculateTier(1300, T)).toBe('gold');
  });

  it('boundary: exactly at platinum threshold is platinum', () => {
    expect(calculateTier(1600, T)).toBe('platinum');
  });

  it('boundary: exactly at elite threshold is elite', () => {
    expect(calculateTier(1900, T)).toBe('elite');
  });

  it('way above elite stays elite', () => {
    expect(calculateTier(3000, T)).toBe('elite');
  });

  it('mid-range', () => {
    expect(calculateTier(1100, T)).toBe('silver');
    expect(calculateTier(1450, T)).toBe('gold');
    expect(calculateTier(1750, T)).toBe('platinum');
  });
});
