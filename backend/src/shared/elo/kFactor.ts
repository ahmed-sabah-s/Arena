import type { KFactorThresholds } from './types.js';

/**
 * Calibration K-factor multiplier.
 *  - matches < calibrationInitialMatchThreshold (5):  initial multiplier (×2.0)
 *  - matches < calibrationMatchCount             (10): late multiplier    (×1.4)
 *  - matches >= calibrationMatchCount                : default multiplier (×1.0)
 */
export function getKFactorMultiplier(
  matchesPlayed: number,
  thresholds: KFactorThresholds,
): number {
  if (matchesPlayed < thresholds.calibrationInitialMatchThreshold) {
    return thresholds.calibrationKFactorInitial;
  }
  if (matchesPlayed < thresholds.calibrationMatchCount) {
    return thresholds.calibrationKFactorLate;
  }
  return thresholds.kFactorDefault;
}
