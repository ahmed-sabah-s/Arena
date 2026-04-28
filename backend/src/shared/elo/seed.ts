import type { ExperienceLevel, SeedThresholds } from './types.js';

/**
 * Maps a self-reported experience level to a starting (elo, mmr) pair. Both
 * numbers seed at the same value — visible ELO and hidden MMR diverge only
 * after match play (via skew protection).
 *
 * Defaults to intermediate when the level is null/undefined. In practice
 * onboarding always captures a level, but the seed should not crash if missing.
 */
export function seedFromExperience(
  level: ExperienceLevel | null | undefined,
  thresholds: SeedThresholds,
): { elo: number; mmr: number } {
  const seed = level ? thresholds[level] : thresholds.intermediate;
  return { elo: seed, mmr: seed };
}
