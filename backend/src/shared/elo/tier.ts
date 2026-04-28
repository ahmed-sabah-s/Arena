import type { Tier, TierThresholds } from './types.js';

/**
 * Pure mapping from visible ELO to tier name. Every team/player has a tier —
 * there is no "unranked" state; pre-calibration entities still get a tier from
 * their seed ELO.
 */
export function calculateTier(elo: number, thresholds: TierThresholds): Tier {
  if (elo >= thresholds.elite) return 'elite';
  if (elo >= thresholds.platinum) return 'platinum';
  if (elo >= thresholds.gold) return 'gold';
  if (elo >= thresholds.silver) return 'silver';
  return 'bronze';
}
