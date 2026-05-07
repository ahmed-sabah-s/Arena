/**
 * Match ELO application.
 *
 * Caller responsibilities (the match service):
 *  - Open the transaction.
 *  - Pass us the resolved final scores.
 *  - We:
 *      - look up participants
 *      - compute deltas via the pure Phase 4 module
 *      - apply rematch cooldown to the visible delta
 *      - update teamElos / playerElos rows
 *  - We do NOT update the match row's status / completed timestamp here —
 *    the caller (resolveMatch in match.service) handles that.
 */
import type { CustomClient } from '../../db.js';
import { ConflictError } from '../../shared/errors/index.js';
import {
  appendForm,
  calculateMatchOutcome,
  resultToForm,
} from '../../shared/elo/index.js';
import type {
  EloThresholds,
  KFactorThresholds,
  MatchResult,
  FormResult,
} from '../../shared/elo/index.js';
import { getConfigInteger, getConfigNumber } from '../../shared/config/platformConfig/index.js';
import type { Match, MatchParticipant } from './match.entity.js';
import type { IMatchRepository } from './match.interface.js';
import type {
  ITeamEloRepository,
  IPlayerEloRepository,
} from '../elo/elo.interface.js';
import type { TeamElo, PlayerElo } from '../elo/elo.entity.js';

const ELO_BASE_K = 32;

export interface SideResolutionSummary {
  side: 'A' | 'B';
  result: MatchResult;
  eloChange: number;
  mmrChange: number;
  newElo: number;
  newMmr: number;
  cooldownMultiplier: number;
}

export interface MatchResolution {
  matchId: string;
  finalScoreA: number;
  finalScoreB: number;
  isRanked: boolean;
  sides: [SideResolutionSummary, SideResolutionSummary];
}

export interface ResolveMatchEloDeps {
  matchRepo: IMatchRepository;
  teamEloRepo: ITeamEloRepository;
  playerEloRepo: IPlayerEloRepository;
}

function determineResult(
  finalScoreA: number,
  finalScoreB: number,
  side: 'A' | 'B',
): MatchResult {
  if (finalScoreA === finalScoreB) return 'draw';
  const aWon = finalScoreA > finalScoreB;
  if (side === 'A') return aWon ? 'win' : 'loss';
  return aWon ? 'loss' : 'win';
}

async function fetchEloThresholds(): Promise<EloThresholds> {
  const [reduced, noGain, noLoss] = await Promise.all([
    getConfigInteger('elo_gap_reduced_threshold'),
    getConfigInteger('elo_gap_no_gain_threshold'),
    getConfigInteger('elo_gap_no_loss_threshold'),
  ]);
  return { reducedThreshold: reduced, noGainThreshold: noGain, noLossThreshold: noLoss };
}

async function fetchKFactorThresholds(): Promise<KFactorThresholds> {
  const [count, initialThreshold, initial, late, dflt] = await Promise.all([
    getConfigInteger('calibration_match_count'),
    getConfigInteger('calibration_k_factor_initial_match_threshold'),
    getConfigNumber('calibration_k_factor_initial'),
    getConfigNumber('calibration_k_factor_late'),
    getConfigNumber('k_factor_default'),
  ]);
  return {
    calibrationMatchCount: count,
    calibrationInitialMatchThreshold: initialThreshold,
    calibrationKFactorInitial: initial,
    calibrationKFactorLate: late,
    kFactorDefault: dflt,
  };
}

interface RematchConfig {
  fullEloLimit: number;
  halfEloLimit: number;
  windowDays: number;
}

async function fetchRematchConfig(): Promise<RematchConfig> {
  const [full, half, days] = await Promise.all([
    getConfigInteger('rematch_full_elo_limit'),
    getConfigInteger('rematch_half_elo_limit'),
    getConfigInteger('rematch_window_days'),
  ]);
  return { fullEloLimit: full, halfEloLimit: half, windowDays: days };
}

/**
 * Decide how much of the visible ELO change to apply based on how many ranked
 * matches the same two teams (or users) have completed within the cooldown window.
 *
 *  - matches in window < fullEloLimit:    multiplier = 1.0 (full ELO)
 *  - matches in window < halfEloLimit:    multiplier = 0.5 (halved)
 *  - matches in window >= halfEloLimit:   multiplier = 0.0 (no visible ELO)
 *
 * Hidden MMR is never touched by this — the system keeps learning regardless.
 */
export function rematchMultiplier(
  matchesInWindow: number,
  cfg: RematchConfig,
): number {
  if (matchesInWindow < cfg.fullEloLimit) return 1.0;
  if (matchesInWindow < cfg.halfEloLimit) return 0.5;
  return 0;
}

interface ApplyEloUpdateInput {
  participant: MatchParticipant;
  result: MatchResult;
  eloChange: number;
  mmrChange: number;
  newElo: number;
  newMmr: number;
  match: Match;
  client: CustomClient;
  teamEloRepo: ITeamEloRepository;
  playerEloRepo: IPlayerEloRepository;
  calibrationMatchCount: number;
}

async function applyEloUpdateForParticipant(input: ApplyEloUpdateInput): Promise<void> {
  const {
    participant, result, eloChange, mmrChange, newElo, newMmr,
    match, client, teamEloRepo, playerEloRepo, calibrationMatchCount,
  } = input;

  const wonInc = result === 'win' ? 1 : 0;
  const lostInc = result === 'loss' ? 1 : 0;
  const drawnInc = result === 'draw' ? 1 : 0;

  if (participant.teamId) {
    const existing = await teamEloRepo.findByTeam(
      participant.teamId, match.gameId, match.formatId, match.divisionId, null,
    );
    if (!existing) throw new ConflictError('TEAM_ELO_NOT_FOUND_AT_RESOLUTION');
    const newForm = appendForm(existing.form as FormResult[], resultToForm(result));
    const updates: Partial<TeamElo> = {
      elo: newElo,
      mmr: newMmr,
      matchesPlayed: existing.matchesPlayed + 1,
      matchesWon: existing.matchesWon + wonInc,
      matchesLost: existing.matchesLost + lostInc,
      matchesDrawn: existing.matchesDrawn + drawnInc,
      lastMatchAt: new Date(),
      form: newForm,
      highestElo: Math.max(existing.highestElo, newElo),
      highestMmr: Math.max(existing.highestMmr, newMmr),
    };
    if (
      existing.calibrationCompleteAt === null &&
      existing.matchesPlayed + 1 >= calibrationMatchCount
    ) {
      updates.calibrationCompleteAt = new Date();
    }
    await teamEloRepo.update(existing.id, updates, client);
    return;
  }

  if (participant.userId) {
    const existing = await playerEloRepo.findByUser(
      participant.userId, match.gameId, match.formatId, match.divisionId, null,
    );
    if (!existing) throw new ConflictError('PLAYER_ELO_NOT_FOUND_AT_RESOLUTION');
    const newForm = appendForm(existing.form as FormResult[], resultToForm(result));
    const updates: Partial<PlayerElo> = {
      elo: newElo,
      mmr: newMmr,
      matchesPlayed: existing.matchesPlayed + 1,
      matchesWon: existing.matchesWon + wonInc,
      matchesLost: existing.matchesLost + lostInc,
      matchesDrawn: existing.matchesDrawn + drawnInc,
      lastMatchAt: new Date(),
      form: newForm,
      highestElo: Math.max(existing.highestElo, newElo),
      highestMmr: Math.max(existing.highestMmr, newMmr),
    };
    if (
      existing.calibrationCompleteAt === null &&
      existing.matchesPlayed + 1 >= calibrationMatchCount
    ) {
      updates.calibrationCompleteAt = new Date();
    }
    await playerEloRepo.update(existing.id, updates, client);
  }
}

/**
 * Compute and apply ELO updates (or no-op for friendly matches), then return a
 * resolution summary the caller can attach to notifications. The match row
 * itself is not modified here — caller updates status/completedAt.
 */
export async function applyMatchEloAndStats(
  match: Match,
  participants: MatchParticipant[],
  finalScoreA: number,
  finalScoreB: number,
  client: CustomClient,
  deps: ResolveMatchEloDeps,
): Promise<MatchResolution> {
  if (participants.length !== 2) {
    throw new ConflictError('MATCH_PARTICIPANTS_INVALID_COUNT');
  }
  const sideA = participants.find((p) => p.side === 'A');
  const sideB = participants.find((p) => p.side === 'B');
  if (!sideA || !sideB) throw new ConflictError('MATCH_PARTICIPANTS_MISSING_SIDE');

  const isRanked = match.stakes === 'ranked';

  // Build a default summary for friendly matches: zero deltas, snapshot values.
  if (!isRanked) {
    const buildFriendly = (p: MatchParticipant): SideResolutionSummary => ({
      side: p.side,
      result: determineResult(finalScoreA, finalScoreB, p.side),
      eloChange: 0,
      mmrChange: 0,
      newElo: p.eloAtMatch,
      newMmr: p.mmrAtMatch,
      cooldownMultiplier: 1,
    });
    return {
      matchId: match.id,
      finalScoreA,
      finalScoreB,
      isRanked: false,
      sides: [buildFriendly(sideA), buildFriendly(sideB)],
    };
  }

  // Ranked: full pipeline.
  const [eloThresholds, kThresholds, rematchCfg, calibrationMatchCount] = await Promise.all([
    fetchEloThresholds(),
    fetchKFactorThresholds(),
    fetchRematchConfig(),
    getConfigInteger('calibration_match_count'),
  ]);

  // Count recent matches between these two opponents
  let recentMatchesInWindow = 0;
  if (sideA.teamId && sideB.teamId) {
    recentMatchesInWindow = await deps.matchRepo.countRecentRankedMatchesBetweenTeams(
      sideA.teamId, sideB.teamId, rematchCfg.windowDays,
    );
  } else if (sideA.userId && sideB.userId) {
    recentMatchesInWindow = await deps.matchRepo.countRecentRankedMatchesBetweenUsers(
      sideA.userId, sideB.userId, rematchCfg.windowDays,
    );
  }
  const cooldownMultiplier = rematchMultiplier(recentMatchesInWindow, rematchCfg);

  // Compute deltas from the pure module using each side's snapshot values.
  const computeForSide = (
    self: MatchParticipant,
    other: MatchParticipant,
  ): { result: MatchResult; eloChange: number; mmrChange: number; newElo: number; newMmr: number } => {
    const result = determineResult(finalScoreA, finalScoreB, self.side);
    const out = calculateMatchOutcome({
      side: { elo: self.eloAtMatch, mmr: self.mmrAtMatch, matchesPlayed: self.matchesPlayedAtMatch },
      opponent: { elo: other.eloAtMatch, mmr: other.mmrAtMatch, matchesPlayed: other.matchesPlayedAtMatch },
      result,
      baseK: ELO_BASE_K,
      thresholds: eloThresholds,
      kThresholds,
    });
    // Apply rematch cooldown to visible delta only — MMR keeps learning.
    const shapedEloChange = Math.round(out.side.eloChange * cooldownMultiplier);
    return {
      result,
      eloChange: shapedEloChange,
      mmrChange: out.side.mmrChange,
      newElo: self.eloAtMatch + shapedEloChange,
      newMmr: out.side.newMmr,
    };
  };

  const sideAOut = computeForSide(sideA, sideB);
  const sideBOut = computeForSide(sideB, sideA);

  // Apply both updates in the supplied transaction.
  await applyEloUpdateForParticipant({
    participant: sideA, result: sideAOut.result,
    eloChange: sideAOut.eloChange, mmrChange: sideAOut.mmrChange,
    newElo: sideAOut.newElo, newMmr: sideAOut.newMmr,
    match, client,
    teamEloRepo: deps.teamEloRepo, playerEloRepo: deps.playerEloRepo,
    calibrationMatchCount,
  });
  await applyEloUpdateForParticipant({
    participant: sideB, result: sideBOut.result,
    eloChange: sideBOut.eloChange, mmrChange: sideBOut.mmrChange,
    newElo: sideBOut.newElo, newMmr: sideBOut.newMmr,
    match, client,
    teamEloRepo: deps.teamEloRepo, playerEloRepo: deps.playerEloRepo,
    calibrationMatchCount,
  });

  return {
    matchId: match.id,
    finalScoreA,
    finalScoreB,
    isRanked: true,
    sides: [
      {
        side: 'A', result: sideAOut.result,
        eloChange: sideAOut.eloChange, mmrChange: sideAOut.mmrChange,
        newElo: sideAOut.newElo, newMmr: sideAOut.newMmr,
        cooldownMultiplier,
      },
      {
        side: 'B', result: sideBOut.result,
        eloChange: sideBOut.eloChange, mmrChange: sideBOut.mmrChange,
        newElo: sideBOut.newElo, newMmr: sideBOut.newMmr,
        cooldownMultiplier,
      },
    ],
  };
}
