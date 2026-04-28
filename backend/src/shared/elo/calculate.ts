import { getKFactorMultiplier } from './kFactor.js';
import { applySkewProtection } from './skewProtection.js';
import type {
  EloDelta,
  EloInput,
  EloThresholds,
  KFactorThresholds,
  MatchResult,
  OpponentInput,
} from './types.js';

export interface CalculateMatchOutcomeInput {
  side: EloInput;
  opponent: OpponentInput;
  result: MatchResult;
  /** Standard ELO base K. 32 is the conventional value. */
  baseK: number;
  thresholds: EloThresholds;
  kThresholds: KFactorThresholds;
}

export interface CalculateMatchOutcomeOutput {
  side: EloDelta;
}

function actualScore(result: MatchResult): number {
  if (result === 'win') return 1;
  if (result === 'draw') return 0.5;
  return 0;
}

/**
 * Standard ELO formula on MMR (the true skill estimate). Visible ELO is shaped
 * separately by skew protection — hidden MMR always reflects the raw delta so
 * the system keeps learning regardless of the cosmetic ELO movement shown.
 */
export function calculateMatchOutcome(
  input: CalculateMatchOutcomeInput,
): CalculateMatchOutcomeOutput {
  const { side, opponent, result, baseK, thresholds, kThresholds } = input;

  const expected = 1 / (1 + Math.pow(10, (opponent.mmr - side.mmr) / 400));
  const actual = actualScore(result);
  const k = baseK * getKFactorMultiplier(side.matchesPlayed, kThresholds);
  const rawDelta = k * (actual - expected);

  const eloDeltaShaped = applySkewProtection({
    rawDelta,
    sideMmr: side.mmr,
    opponentMmr: opponent.mmr,
    result,
    thresholds,
  });

  const mmrChange = Math.round(rawDelta);
  const eloChange = Math.round(eloDeltaShaped);

  return {
    side: {
      eloChange,
      mmrChange,
      newElo: side.elo + eloChange,
      newMmr: side.mmr + mmrChange,
    },
  };
}
