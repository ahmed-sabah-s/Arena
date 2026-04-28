import type { EloThresholds, MatchResult } from './types.js';

export interface ApplySkewProtectionInput {
  /** Raw delta from standard ELO math. Sign matches result direction. */
  rawDelta: number;
  /** This side's MMR before the match. */
  sideMmr: number;
  /** Opponent's MMR before the match. */
  opponentMmr: number;
  /** This side's match outcome. */
  result: MatchResult;
  thresholds: EloThresholds;
}

/**
 * Skew protection. Hidden MMR always uses the raw delta; only visible ELO is shaped.
 *
 *  - Draws: skew protection does nothing. Symmetric.
 *  - Favorite wins by huge gap (> noGainThreshold): visible ELO change = 0.
 *  - Favorite wins by moderate gap (> reducedThreshold): visible ELO change halved.
 *  - Underdog losses get the same floor: huge-gap loss → 0, moderate-gap loss → halved.
 *  - Upsets (underdog wins) and balanced matches always pay full ELO. Arena rewards upsets.
 */
export function applySkewProtection(input: ApplySkewProtectionInput): number {
  const { rawDelta, sideMmr, opponentMmr, result, thresholds } = input;

  if (result === 'draw') {
    return rawDelta;
  }

  if (result === 'win') {
    const gap = sideMmr - opponentMmr;
    if (gap > thresholds.noGainThreshold) return 0;
    if (gap > thresholds.reducedThreshold) return Math.round(rawDelta * 0.5);
    return rawDelta;
  }

  // result === 'loss' — rawDelta is negative.
  const oppGap = opponentMmr - sideMmr;
  if (oppGap > thresholds.noLossThreshold) return 0;
  if (oppGap > thresholds.reducedThreshold) return Math.round(rawDelta * 0.5);
  return rawDelta;
}
