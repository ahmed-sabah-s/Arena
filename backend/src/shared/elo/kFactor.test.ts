import { describe, it, expect } from 'vitest';
import { getKFactorMultiplier } from './kFactor.js';
import type { KFactorThresholds } from './types.js';

const T: KFactorThresholds = {
  calibrationMatchCount: 10,
  calibrationInitialMatchThreshold: 5,
  calibrationKFactorInitial: 2.0,
  calibrationKFactorLate: 1.4,
  kFactorDefault: 1.0,
};

describe('getKFactorMultiplier', () => {
  it('returns initial multiplier for matches 0–4', () => {
    expect(getKFactorMultiplier(0, T)).toBe(2.0);
    expect(getKFactorMultiplier(1, T)).toBe(2.0);
    expect(getKFactorMultiplier(4, T)).toBe(2.0);
  });

  it('returns late multiplier for matches 5–9', () => {
    expect(getKFactorMultiplier(5, T)).toBe(1.4);
    expect(getKFactorMultiplier(7, T)).toBe(1.4);
    expect(getKFactorMultiplier(9, T)).toBe(1.4);
  });

  it('returns default multiplier for matches 10+', () => {
    expect(getKFactorMultiplier(10, T)).toBe(1.0);
    expect(getKFactorMultiplier(50, T)).toBe(1.0);
    expect(getKFactorMultiplier(1000, T)).toBe(1.0);
  });
});
