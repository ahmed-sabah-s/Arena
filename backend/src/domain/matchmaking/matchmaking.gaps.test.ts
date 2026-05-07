import { describe, it, expect } from 'vitest';
import { computeAllowedMmrGap } from './matchmaking.gaps.js';

const sparse = {
  enabled: true,
  gap2min: 100,
  gap5min: 300,
  gap8min: 600,
  maxWaitMinutes: 10,
};

const mature = {
  gap2min: 100,
  gap5min: 200,
  gapMax: 400,
};

describe('computeAllowedMmrGap — sparse mode', () => {
  it('< 2 min uses gap2min', () => {
    expect(computeAllowedMmrGap(0, true, sparse, mature)).toBe(100);
    expect(computeAllowedMmrGap(1.5, true, sparse, mature)).toBe(100);
  });
  it('2–5 min uses gap5min', () => {
    expect(computeAllowedMmrGap(2, true, sparse, mature)).toBe(300);
    expect(computeAllowedMmrGap(4.9, true, sparse, mature)).toBe(300);
  });
  it('5+ min (under maxWait) uses gap8min', () => {
    expect(computeAllowedMmrGap(5, true, sparse, mature)).toBe(600);
    expect(computeAllowedMmrGap(9.9, true, sparse, mature)).toBe(600);
  });
  it('>= maxWaitMinutes returns Infinity', () => {
    expect(computeAllowedMmrGap(10, true, sparse, mature)).toBe(Number.POSITIVE_INFINITY);
    expect(computeAllowedMmrGap(60, true, sparse, mature)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('computeAllowedMmrGap — mature mode', () => {
  it('< 2 min uses gap2min', () => {
    expect(computeAllowedMmrGap(0, false, sparse, mature)).toBe(100);
  });
  it('2–5 min uses gap5min', () => {
    expect(computeAllowedMmrGap(3, false, sparse, mature)).toBe(200);
  });
  it('5+ min uses gapMax', () => {
    expect(computeAllowedMmrGap(5, false, sparse, mature)).toBe(400);
    expect(computeAllowedMmrGap(60, false, sparse, mature)).toBe(400);
  });
});
