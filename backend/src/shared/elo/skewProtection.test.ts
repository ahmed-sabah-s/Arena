import { describe, it, expect } from 'vitest';
import { applySkewProtection } from './skewProtection.js';
import type { EloThresholds } from './types.js';

const T: EloThresholds = {
  reducedThreshold: 150,
  noGainThreshold: 300,
  noLossThreshold: 300,
};

describe('applySkewProtection — wins', () => {
  it('balanced match: full delta', () => {
    expect(applySkewProtection({
      rawDelta: 16, sideMmr: 1000, opponentMmr: 1000, result: 'win', thresholds: T,
    })).toBe(16);
  });

  it('favorite winning by 100 (below reduced): full delta', () => {
    expect(applySkewProtection({
      rawDelta: 12, sideMmr: 1100, opponentMmr: 1000, result: 'win', thresholds: T,
    })).toBe(12);
  });

  it('favorite winning by 200 (in reduced zone): halved', () => {
    expect(applySkewProtection({
      rawDelta: 8, sideMmr: 1200, opponentMmr: 1000, result: 'win', thresholds: T,
    })).toBe(4);
  });

  it('favorite winning by 400 (above noGain): zero', () => {
    expect(applySkewProtection({
      rawDelta: 4, sideMmr: 1400, opponentMmr: 1000, result: 'win', thresholds: T,
    })).toBe(0);
  });

  it('underdog winning by 400 (the upset): full delta', () => {
    expect(applySkewProtection({
      rawDelta: 28, sideMmr: 1000, opponentMmr: 1400, result: 'win', thresholds: T,
    })).toBe(28);
  });
});

describe('applySkewProtection — losses', () => {
  it('balanced match loss: full delta', () => {
    expect(applySkewProtection({
      rawDelta: -16, sideMmr: 1000, opponentMmr: 1000, result: 'loss', thresholds: T,
    })).toBe(-16);
  });

  it('underdog losing by 100 (below reduced): full delta', () => {
    expect(applySkewProtection({
      rawDelta: -12, sideMmr: 1000, opponentMmr: 1100, result: 'loss', thresholds: T,
    })).toBe(-12);
  });

  it('underdog losing by 200 (in reduced zone): halved', () => {
    expect(applySkewProtection({
      rawDelta: -8, sideMmr: 1000, opponentMmr: 1200, result: 'loss', thresholds: T,
    })).toBe(-4);
  });

  it('underdog losing by 400 (above noLoss): zero', () => {
    expect(applySkewProtection({
      rawDelta: -4, sideMmr: 1000, opponentMmr: 1400, result: 'loss', thresholds: T,
    })).toBe(0);
  });

  it('favorite losing by 400 (heavy upset against): full delta', () => {
    // The favorite (sideMmr higher) is losing — gap-from-opponent is negative,
    // so neither floor nor reduced zone applies; pay the full negative delta.
    expect(applySkewProtection({
      rawDelta: -28, sideMmr: 1400, opponentMmr: 1000, result: 'loss', thresholds: T,
    })).toBe(-28);
  });
});

describe('applySkewProtection — draws', () => {
  it('draw with huge gap returns rawDelta unchanged', () => {
    expect(applySkewProtection({
      rawDelta: -3, sideMmr: 1400, opponentMmr: 1000, result: 'draw', thresholds: T,
    })).toBe(-3);
  });

  it('draw with equal MMR returns rawDelta unchanged', () => {
    expect(applySkewProtection({
      rawDelta: 0, sideMmr: 1000, opponentMmr: 1000, result: 'draw', thresholds: T,
    })).toBe(0);
  });
});
