import type { CustomClient } from '../../db.js';
import { query } from '../../db.js';
import { ConflictError, NotFoundError } from '../../shared/errors/index.js';
import { getConfigInteger } from '../../shared/config/platformConfig/index.js';
import {
  calculateTier,
  seedFromExperience,
} from '../../shared/elo/index.js';
import type {
  ExperienceLevel,
  Tier,
  TierThresholds,
  SeedThresholds,
} from '../../shared/elo/index.js';
import type {
  ITeamEloRepository,
  IPlayerEloRepository,
} from './elo.interface.js';
import type { TeamElo, PlayerElo } from './elo.entity.js';

interface SeedTeamEloArgs {
  teamId: string;
  gameId: string;
  formatId: string;
  divisionId: string | null;
  /** Captain's experience level — used to derive the seed value. */
  captainExperienceLevel: ExperienceLevel | null;
}

interface SeedPlayerEloArgs {
  userId: string;
  gameId: string;
  formatId: string;
  divisionId: string | null;
  experienceLevel: ExperienceLevel | null;
}

export class EloService {
  constructor(
    private readonly teamEloRepo: ITeamEloRepository,
    private readonly playerEloRepo: IPlayerEloRepository,
  ) {}

  /**
   * Seed a teamElos row at all-time scope (seasonId=null) using the captain's
   * experienceLevel. Phase 4 keeps seed value captain-derived; later phases may
   * average across founding members or use other heuristics.
   *
   * Throws TEAM_ELO_ALREADY_EXISTS if a row at the same scope is already present.
   * Caller (team service) is responsible for not double-seeding.
   */
  async seedTeamElo(args: SeedTeamEloArgs, client?: CustomClient): Promise<TeamElo> {
    const existing = await this.teamEloRepo.findByTeam(
      args.teamId, args.gameId, args.formatId, args.divisionId, null,
    );
    if (existing) {
      throw new ConflictError('TEAM_ELO_ALREADY_EXISTS');
    }

    const seedThresholds = await this.fetchSeedThresholds();
    const { elo, mmr } = seedFromExperience(args.captainExperienceLevel, seedThresholds);

    return this.teamEloRepo.create(
      {
        teamId: args.teamId,
        gameId: args.gameId,
        formatId: args.formatId,
        divisionId: args.divisionId,
        seasonId: null,
        elo,
        mmr,
      },
      client,
    );
  }

  /**
   * Seed a playerElos row. Phase 4 defines this for Phase 5's matchmaking flow
   * to call lazily (on first queue/match in an individual game). No caller in
   * Phase 4 invokes this — it sits ready.
   */
  async seedPlayerElo(args: SeedPlayerEloArgs, client?: CustomClient): Promise<PlayerElo> {
    const existing = await this.playerEloRepo.findByUser(
      args.userId, args.gameId, args.formatId, args.divisionId, null,
    );
    if (existing) {
      throw new ConflictError('PLAYER_ELO_ALREADY_EXISTS');
    }

    const seedThresholds = await this.fetchSeedThresholds();
    const { elo, mmr } = seedFromExperience(args.experienceLevel, seedThresholds);

    return this.playerEloRepo.create(
      {
        userId: args.userId,
        gameId: args.gameId,
        formatId: args.formatId,
        divisionId: args.divisionId,
        seasonId: null,
        elo,
        mmr,
      },
      client,
    );
  }

  /**
   * Tier is not stored on the row — it's derived from visible ELO and the current
   * tier thresholds in platformConfig. Calls hit this method for the lookup.
   */
  async recalculateTier(elo: number): Promise<Tier> {
    const thresholds = await this.fetchTierThresholds();
    return calculateTier(elo, thresholds);
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  private async fetchSeedThresholds(): Promise<SeedThresholds> {
    const [beginner, intermediate, advanced, expert] = await Promise.all([
      getConfigInteger('starting_mmr_beginner'),
      getConfigInteger('starting_mmr_intermediate'),
      getConfigInteger('starting_mmr_advanced'),
      getConfigInteger('starting_mmr_expert'),
    ]);
    return { beginner, intermediate, advanced, expert };
  }

  private async fetchTierThresholds(): Promise<TierThresholds> {
    const [bronze, silver, gold, platinum, elite] = await Promise.all([
      getConfigInteger('tier_threshold_bronze'),
      getConfigInteger('tier_threshold_silver'),
      getConfigInteger('tier_threshold_gold'),
      getConfigInteger('tier_threshold_platinum'),
      getConfigInteger('tier_threshold_elite'),
    ]);
    return { bronze, silver, gold, platinum, elite };
  }
}

// Helper for callers that need the captain's experienceLevel during team creation —
// avoids forcing the team service to query the user table directly.
export async function fetchUserExperienceLevel(userId: string): Promise<ExperienceLevel | null> {
  const [row] = await query<{ experienceLevel: ExperienceLevel | null }>(
    `SELECT "experienceLevel" FROM "user" WHERE id = :userId`,
    { userId },
  );
  if (!row) throw new NotFoundError('User');
  return row.experienceLevel;
}
