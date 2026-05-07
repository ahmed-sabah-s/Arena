/**
 * Pure: how wide an MMR window the matchmaker accepts at a given wait time
 * for a given pool maturity (sparse vs mature).
 *
 * Sparse mode (small pool): aggressive widening — short wait → wider gap.
 * Mature mode: standard widening with a hard cap.
 *
 * After sparseConfig.maxWaitMinutes in sparse mode, the gap is Infinity (any opponent).
 */
export interface SparseModeConfig {
  enabled: boolean;
  gap2min: number;
  gap5min: number;
  gap8min: number;
  maxWaitMinutes: number;
}

export interface MatureModeConfig {
  gap2min: number;
  gap5min: number;
  gapMax: number;
}

export function computeAllowedMmrGap(
  waitMinutes: number,
  sparseMode: boolean,
  sparse: SparseModeConfig,
  mature: MatureModeConfig,
): number {
  if (sparseMode) {
    if (waitMinutes >= sparse.maxWaitMinutes) return Number.POSITIVE_INFINITY;
    if (waitMinutes < 2) return sparse.gap2min;
    if (waitMinutes < 5) return sparse.gap5min;
    return sparse.gap8min;
  }
  if (waitMinutes < 2) return mature.gap2min;
  if (waitMinutes < 5) return mature.gap5min;
  return mature.gapMax;
}
