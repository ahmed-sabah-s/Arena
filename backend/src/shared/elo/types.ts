// Pure types for the ELO math module. No DB, no IO.

export type MatchResult = 'win' | 'loss' | 'draw';
export type FormResult = 'W' | 'L' | 'D';
export type Tier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'elite';

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export interface EloInput {
  /** Current visible ELO of the entity. */
  elo: number;
  /** Current hidden MMR of the entity. */
  mmr: number;
  /** Matches played so far (used for calibration logic). */
  matchesPlayed: number;
}

export interface OpponentInput {
  elo: number;
  mmr: number;
  matchesPlayed: number;
}

export interface EloThresholds {
  /** Below this gap, ELO math runs as normal. Above: halved. */
  reducedThreshold: number;
  /** At or above this gap, favorite gains 0 visible ELO. */
  noGainThreshold: number;
  /** At or above this gap, underdog loses 0 visible ELO. */
  noLossThreshold: number;
}

export interface KFactorThresholds {
  calibrationMatchCount: number;
  calibrationInitialMatchThreshold: number;
  calibrationKFactorInitial: number;
  calibrationKFactorLate: number;
  kFactorDefault: number;
}

export interface TierThresholds {
  bronze: number;
  silver: number;
  gold: number;
  platinum: number;
  elite: number;
}

export interface SeedThresholds {
  beginner: number;
  intermediate: number;
  advanced: number;
  expert: number;
}

export interface EloDelta {
  /** Visible ELO change. May be 0 from skew protection. */
  eloChange: number;
  /** Hidden MMR change. Always reflects the "true" math, no skew protection. */
  mmrChange: number;
  /** New visible ELO after the change. */
  newElo: number;
  /** New hidden MMR after the change. */
  newMmr: number;
}
