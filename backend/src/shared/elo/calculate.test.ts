import { describe, it, expect } from 'vitest';
import { calculateMatchOutcome } from './calculate.js';
import type { EloThresholds, KFactorThresholds } from './types.js';

const ELO_T: EloThresholds = {
  reducedThreshold: 150,
  noGainThreshold: 300,
  noLossThreshold: 300,
};

const K_T: KFactorThresholds = {
  calibrationMatchCount: 10,
  calibrationInitialMatchThreshold: 5,
  calibrationKFactorInitial: 2.0,
  calibrationKFactorLate: 1.4,
  kFactorDefault: 1.0,
};

describe('calculateMatchOutcome — equal MMR', () => {
  it('post-calibration win at equal MMR yields +baseK/2 (16) on each axis', () => {
    const out = calculateMatchOutcome({
      side:     { elo: 1000, mmr: 1000, matchesPlayed: 20 },
      opponent: { elo: 1000, mmr: 1000, matchesPlayed: 20 },
      result: 'win', baseK: 32, thresholds: ELO_T, kThresholds: K_T,
    });
    expect(out.side.eloChange).toBe(16);
    expect(out.side.mmrChange).toBe(16);
    expect(out.side.newElo).toBe(1016);
    expect(out.side.newMmr).toBe(1016);
  });

  it('post-calibration loss at equal MMR yields -baseK/2 (-16) on each axis', () => {
    const out = calculateMatchOutcome({
      side:     { elo: 1000, mmr: 1000, matchesPlayed: 20 },
      opponent: { elo: 1000, mmr: 1000, matchesPlayed: 20 },
      result: 'loss', baseK: 32, thresholds: ELO_T, kThresholds: K_T,
    });
    expect(out.side.eloChange).toBe(-16);
    expect(out.side.mmrChange).toBe(-16);
  });

  it('draw at equal MMR yields zero on each axis', () => {
    const out = calculateMatchOutcome({
      side:     { elo: 1000, mmr: 1000, matchesPlayed: 20 },
      opponent: { elo: 1000, mmr: 1000, matchesPlayed: 20 },
      result: 'draw', baseK: 32, thresholds: ELO_T, kThresholds: K_T,
    });
    expect(out.side.eloChange).toBe(0);
    expect(out.side.mmrChange).toBe(0);
  });
});

describe('calculateMatchOutcome — calibration', () => {
  it('first match (matchesPlayed=0): K is doubled vs post-calibration', () => {
    const calibrated = calculateMatchOutcome({
      side:     { elo: 1000, mmr: 1000, matchesPlayed: 0 },
      opponent: { elo: 1000, mmr: 1000, matchesPlayed: 0 },
      result: 'win', baseK: 32, thresholds: ELO_T, kThresholds: K_T,
    });
    // K = 32 * 2 = 64; expected delta = 64 * 0.5 = 32
    expect(calibrated.side.mmrChange).toBe(32);
  });

  it('matchesPlayed=7 (late calibration): K = 32 * 1.4 = 44.8', () => {
    const out = calculateMatchOutcome({
      side:     { elo: 1000, mmr: 1000, matchesPlayed: 7 },
      opponent: { elo: 1000, mmr: 1000, matchesPlayed: 0 },
      result: 'win', baseK: 32, thresholds: ELO_T, kThresholds: K_T,
    });
    // 44.8 * 0.5 = 22.4 → rounds to 22
    expect(out.side.mmrChange).toBe(22);
  });

  it('matchesPlayed=15 (post-calibration): K = 32', () => {
    const out = calculateMatchOutcome({
      side:     { elo: 1000, mmr: 1000, matchesPlayed: 15 },
      opponent: { elo: 1000, mmr: 1000, matchesPlayed: 0 },
      result: 'win', baseK: 32, thresholds: ELO_T, kThresholds: K_T,
    });
    expect(out.side.mmrChange).toBe(16);
  });
});

describe('calculateMatchOutcome — skew protection in context', () => {
  it('favorite winning by 400 MMR: full MMR delta, zero ELO delta', () => {
    const out = calculateMatchOutcome({
      side:     { elo: 1400, mmr: 1400, matchesPlayed: 20 },
      opponent: { elo: 1000, mmr: 1000, matchesPlayed: 20 },
      result: 'win', baseK: 32, thresholds: ELO_T, kThresholds: K_T,
    });
    // Expected score for sideMmr=1400 vs 1000 ≈ 0.909, K=32, raw≈2.9, rounds to 3
    expect(out.side.mmrChange).toBe(3);
    expect(out.side.eloChange).toBe(0);
  });

  it('underdog winning by 400 MMR (upset): full reward on both axes', () => {
    const out = calculateMatchOutcome({
      side:     { elo: 1000, mmr: 1000, matchesPlayed: 20 },
      opponent: { elo: 1400, mmr: 1400, matchesPlayed: 20 },
      result: 'win', baseK: 32, thresholds: ELO_T, kThresholds: K_T,
    });
    // Expected score ≈ 0.091, raw ≈ 29.1, rounds to 29
    expect(out.side.mmrChange).toBe(29);
    expect(out.side.eloChange).toBe(29);
  });

  it('favorite winning in reduced zone (gap=200): ELO halved, MMR full', () => {
    const out = calculateMatchOutcome({
      side:     { elo: 1200, mmr: 1200, matchesPlayed: 20 },
      opponent: { elo: 1000, mmr: 1000, matchesPlayed: 20 },
      result: 'win', baseK: 32, thresholds: ELO_T, kThresholds: K_T,
    });
    // Expected score ≈ 0.760, raw ≈ 7.69, rounds to 8 for MMR; ELO halved ≈ 4
    expect(out.side.mmrChange).toBe(8);
    expect(out.side.eloChange).toBe(4);
  });
});
