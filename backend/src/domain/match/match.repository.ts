import pg from 'pg';
import { query } from '../../db.js';
import type { CustomClient } from '../../db.js';
import { AppError, NotFoundError } from '../../shared/errors/index.js';
import type {
  Dispute,
  Match,
  MatchParticipant,
  MatchSide,
  MatchStat,
  MatchStatLog,
  MatchStatus,
  MatchSubmission,
} from './match.entity.js';
import type {
  CreateDisputeData,
  CreateMatchData,
  CreateMatchParticipantData,
  CreateMatchStatData,
  CreateStatLogData,
  IDisputeRepository,
  IMatchParticipantRepository,
  IMatchRepository,
  IMatchStatLogRepository,
  IMatchStatRepository,
  IMatchSubmissionRepository,
  UpsertSubmissionData,
} from './match.interface.js';

async function exec<T extends pg.QueryResultRow>(
  client: CustomClient | undefined,
  sql: string,
  params: Record<string, unknown>,
): Promise<T[]> {
  if (client) {
    const res = await client.query<T>(sql, params);
    return res.rows;
  }
  return query<T>(sql, params);
}

// ─── Match ───────────────────────────────────────────────────────────────────

export class MatchRepository implements IMatchRepository {
  async create(input: CreateMatchData, client: CustomClient): Promise<Match> {
    const rows = await exec<Match>(
      client,
      `INSERT INTO matches (
         "gameId", "formatId", "divisionId", "seasonId",
         "matchMode", stakes, status, "venueId", "scheduledAt", "creationSource"
       )
       VALUES (
         :gameId, :formatId, :divisionId, :seasonId,
         :matchMode, :stakes, 'scheduled', :venueId, :scheduledAt, :creationSource
       )
       RETURNING *`,
      {
        gameId: input.gameId,
        formatId: input.formatId,
        divisionId: input.divisionId,
        seasonId: input.seasonId,
        matchMode: input.matchMode,
        stakes: input.stakes,
        venueId: input.venueId,
        scheduledAt: input.scheduledAt,
        creationSource: input.creationSource,
      },
    );
    if (!rows[0]) throw new AppError('Failed to create match', 500);
    return rows[0];
  }

  async findById(id: string): Promise<Match | null> {
    const [row] = await query<Match>(`SELECT * FROM matches WHERE id = :id`, { id });
    return row ?? null;
  }

  async findByIdForUpdate(id: string, client: CustomClient): Promise<Match | null> {
    const res = await client.query<Match>(
      `SELECT * FROM matches WHERE id = :id FOR UPDATE`,
      { id },
    );
    return res.rows[0] ?? null;
  }

  async updateStatus(id: string, status: MatchStatus, client: CustomClient): Promise<Match> {
    const rows = await exec<Match>(
      client,
      `UPDATE matches SET status = :status WHERE id = :id RETURNING *`,
      { id, status },
    );
    if (!rows[0]) throw new NotFoundError('Match');
    return rows[0];
  }

  async setStarted(id: string, client: CustomClient): Promise<Match> {
    const rows = await exec<Match>(
      client,
      `UPDATE matches
       SET status = 'active', "startedAt" = CURRENT_TIMESTAMP
       WHERE id = :id RETURNING *`,
      { id },
    );
    if (!rows[0]) throw new NotFoundError('Match');
    return rows[0];
  }

  async setCompleted(
    id: string,
    finalScoreA: number,
    finalScoreB: number,
    client: CustomClient,
  ): Promise<Match> {
    const rows = await exec<Match>(
      client,
      `UPDATE matches
       SET status = 'completed',
           "completedAt" = CURRENT_TIMESTAMP,
           "finalScoreA" = :finalScoreA,
           "finalScoreB" = :finalScoreB
       WHERE id = :id RETURNING *`,
      { id, finalScoreA, finalScoreB },
    );
    if (!rows[0]) throw new NotFoundError('Match');
    return rows[0];
  }

  async countRecentRankedMatchesBetweenTeams(
    teamA: string,
    teamB: string,
    withinDays: number,
  ): Promise<number> {
    // Count completed matches where the two teams faced each other on opposing sides.
    const [row] = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM matches m
       WHERE m.stakes = 'ranked'
         AND m.status = 'completed'
         AND m."completedAt" > CURRENT_TIMESTAMP - (:days || ' days')::interval
         AND EXISTS (
           SELECT 1 FROM "matchParticipants" pa
           WHERE pa."matchId" = m.id AND pa."teamId" = :teamA AND pa.side = 'A'
         )
         AND EXISTS (
           SELECT 1 FROM "matchParticipants" pb
           WHERE pb."matchId" = m.id AND pb."teamId" = :teamB AND pb.side = 'B'
         )
       UNION ALL
       SELECT COUNT(*) FROM matches m
       WHERE m.stakes = 'ranked'
         AND m.status = 'completed'
         AND m."completedAt" > CURRENT_TIMESTAMP - (:days || ' days')::interval
         AND EXISTS (
           SELECT 1 FROM "matchParticipants" pa
           WHERE pa."matchId" = m.id AND pa."teamId" = :teamB AND pa.side = 'A'
         )
         AND EXISTS (
           SELECT 1 FROM "matchParticipants" pb
           WHERE pb."matchId" = m.id AND pb."teamId" = :teamA AND pb.side = 'B'
         )`,
      { teamA, teamB, days: withinDays.toString() },
    );
    // Sum both directions
    const second = (await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM matches m
       WHERE m.stakes = 'ranked'
         AND m.status = 'completed'
         AND m."completedAt" > CURRENT_TIMESTAMP - (:days || ' days')::interval
         AND EXISTS (
           SELECT 1 FROM "matchParticipants" pa
           WHERE pa."matchId" = m.id AND pa."teamId" = :teamB AND pa.side = 'A'
         )
         AND EXISTS (
           SELECT 1 FROM "matchParticipants" pb
           WHERE pb."matchId" = m.id AND pb."teamId" = :teamA AND pb.side = 'B'
         )`,
      { teamA, teamB, days: withinDays.toString() },
    ))[0];
    return parseInt(row?.count ?? '0', 10) + parseInt(second?.count ?? '0', 10);
  }

  async countRecentRankedMatchesBetweenUsers(
    userA: string,
    userB: string,
    withinDays: number,
  ): Promise<number> {
    const [a] = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM matches m
       WHERE m.stakes = 'ranked'
         AND m.status = 'completed'
         AND m."completedAt" > CURRENT_TIMESTAMP - (:days || ' days')::interval
         AND EXISTS (
           SELECT 1 FROM "matchParticipants" pa
           WHERE pa."matchId" = m.id AND pa."userId" = :userA AND pa.side = 'A'
         )
         AND EXISTS (
           SELECT 1 FROM "matchParticipants" pb
           WHERE pb."matchId" = m.id AND pb."userId" = :userB AND pb.side = 'B'
         )`,
      { userA, userB, days: withinDays.toString() },
    );
    const [b] = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM matches m
       WHERE m.stakes = 'ranked'
         AND m.status = 'completed'
         AND m."completedAt" > CURRENT_TIMESTAMP - (:days || ' days')::interval
         AND EXISTS (
           SELECT 1 FROM "matchParticipants" pa
           WHERE pa."matchId" = m.id AND pa."userId" = :userB AND pa.side = 'A'
         )
         AND EXISTS (
           SELECT 1 FROM "matchParticipants" pb
           WHERE pb."matchId" = m.id AND pb."userId" = :userA AND pb.side = 'B'
         )`,
      { userA, userB, days: withinDays.toString() },
    );
    return parseInt(a?.count ?? '0', 10) + parseInt(b?.count ?? '0', 10);
  }

  async findScheduledForMatchmaker(
    gameId: string,
    formatId: string,
    divisionId: string | null,
  ): Promise<Match[]> {
    return query<Match>(
      `SELECT * FROM matches
       WHERE "gameId" = :gameId
         AND "formatId" = :formatId
         AND "divisionId" IS NOT DISTINCT FROM :divisionId
         AND status IN ('scheduled', 'active', 'awaiting_confirmation')
       ORDER BY "scheduledAt" ASC`,
      { gameId, formatId, divisionId },
    );
  }

  async findAwaitingConfirmationOlderThan(hours: number): Promise<Match[]> {
    return query<Match>(
      `SELECT * FROM matches
       WHERE status = 'awaiting_confirmation'
         AND "updatedAt" < CURRENT_TIMESTAMP - (:hours || ' hours')::interval`,
      { hours: hours.toString() },
    );
  }
}

// ─── Match Participants ──────────────────────────────────────────────────────

export class MatchParticipantRepository implements IMatchParticipantRepository {
  async create(
    input: CreateMatchParticipantData,
    client: CustomClient,
  ): Promise<MatchParticipant> {
    const rows = await exec<MatchParticipant>(
      client,
      `INSERT INTO "matchParticipants" (
         "matchId", side, "teamId", "userId",
         "mmrAtMatch", "eloAtMatch", "matchesPlayedAtMatch"
       )
       VALUES (:matchId, :side, :teamId, :userId, :mmrAtMatch, :eloAtMatch, :matchesPlayedAtMatch)
       RETURNING *`,
      { ...input },
    );
    if (!rows[0]) throw new AppError('Failed to create match participant', 500);
    return rows[0];
  }

  async findByMatchId(matchId: string, client?: CustomClient): Promise<MatchParticipant[]> {
    if (client) {
      const res = await client.query<MatchParticipant>(
        `SELECT * FROM "matchParticipants" WHERE "matchId" = :matchId ORDER BY side ASC`,
        { matchId },
      );
      return res.rows;
    }
    return query<MatchParticipant>(
      `SELECT * FROM "matchParticipants" WHERE "matchId" = :matchId ORDER BY side ASC`,
      { matchId },
    );
  }

  async findByMatchAndSide(matchId: string, side: MatchSide, client?: CustomClient): Promise<MatchParticipant | null> {
    if (client) {
      const res = await client.query<MatchParticipant>(
        `SELECT * FROM "matchParticipants" WHERE "matchId" = :matchId AND side = :side`,
        { matchId, side },
      );
      return res.rows[0] ?? null;
    }
    const [row] = await query<MatchParticipant>(
      `SELECT * FROM "matchParticipants" WHERE "matchId" = :matchId AND side = :side`,
      { matchId, side },
    );
    return row ?? null;
  }

  async setStatKeeper(
    matchId: string,
    side: MatchSide,
    statKeeperUserId: string,
    client: CustomClient,
  ): Promise<MatchParticipant> {
    const rows = await exec<MatchParticipant>(
      client,
      `UPDATE "matchParticipants"
       SET "statKeeperUserId" = :statKeeperUserId
       WHERE "matchId" = :matchId AND side = :side
       RETURNING *`,
      { matchId, side, statKeeperUserId },
    );
    if (!rows[0]) throw new NotFoundError('MatchParticipant');
    return rows[0];
  }
}

// ─── Match Submissions ───────────────────────────────────────────────────────

export class MatchSubmissionRepository implements IMatchSubmissionRepository {
  async upsert(input: UpsertSubmissionData, client: CustomClient): Promise<MatchSubmission> {
    const rows = await exec<MatchSubmission>(
      client,
      `INSERT INTO "matchSubmissions" (
         "matchId", side, "submittedByUserId", "scoreA", "scoreB", notes
       )
       VALUES (:matchId, :side, :submittedByUserId, :scoreA, :scoreB, :notes)
       ON CONFLICT ("matchId", side) DO UPDATE SET
         "submittedByUserId" = EXCLUDED."submittedByUserId",
         "scoreA" = EXCLUDED."scoreA",
         "scoreB" = EXCLUDED."scoreB",
         notes = EXCLUDED.notes,
         "submittedAt" = CURRENT_TIMESTAMP
       RETURNING *`,
      {
        matchId: input.matchId,
        side: input.side,
        submittedByUserId: input.submittedByUserId,
        scoreA: input.scoreA,
        scoreB: input.scoreB,
        notes: input.notes ?? null,
      },
    );
    if (!rows[0]) throw new AppError('Failed to upsert match submission', 500);
    return rows[0];
  }

  async findByMatch(matchId: string, client?: CustomClient): Promise<MatchSubmission[]> {
    if (client) {
      const res = await client.query<MatchSubmission>(
        `SELECT * FROM "matchSubmissions" WHERE "matchId" = :matchId ORDER BY side ASC`,
        { matchId },
      );
      return res.rows;
    }
    return query<MatchSubmission>(
      `SELECT * FROM "matchSubmissions" WHERE "matchId" = :matchId ORDER BY side ASC`,
      { matchId },
    );
  }
}

// ─── Stat Logs ───────────────────────────────────────────────────────────────

export class MatchStatLogRepository implements IMatchStatLogRepository {
  async create(input: CreateStatLogData, client?: CustomClient): Promise<MatchStatLog> {
    const sql = `INSERT INTO "matchStatLogs" (
                   "matchId", "loggedByUserId", side, "statKey", "statValue", minute, "playerId"
                 )
                 VALUES (:matchId, :loggedByUserId, :side, :statKey, :statValue, :minute, :playerId)
                 RETURNING *`;
    const params = {
      matchId: input.matchId,
      loggedByUserId: input.loggedByUserId,
      side: input.side,
      statKey: input.statKey,
      statValue: JSON.stringify(input.statValue ?? null),
      minute: input.minute ?? null,
      playerId: input.playerId ?? null,
    };
    const rows = await exec<MatchStatLog>(client, sql, params);
    if (!rows[0]) throw new AppError('Failed to create stat log', 500);
    return rows[0];
  }

  async findByMatch(matchId: string): Promise<MatchStatLog[]> {
    return query<MatchStatLog>(
      `SELECT * FROM "matchStatLogs"
       WHERE "matchId" = :matchId
       ORDER BY "recordedAt" ASC`,
      { matchId },
    );
  }
}

// ─── Reconciled Match Stats ──────────────────────────────────────────────────

export class MatchStatRepository implements IMatchStatRepository {
  async create(input: CreateMatchStatData, client: CustomClient): Promise<MatchStat> {
    const rows = await exec<MatchStat>(
      client,
      `INSERT INTO "matchStats" (
         "matchId", side, "statKey", "statValue", minute, "playerId", "verificationStatus"
       )
       VALUES (:matchId, :side, :statKey, :statValue, :minute, :playerId, :verificationStatus)
       RETURNING *`,
      {
        matchId: input.matchId,
        side: input.side,
        statKey: input.statKey,
        statValue: JSON.stringify(input.statValue ?? null),
        minute: input.minute,
        playerId: input.playerId,
        verificationStatus: input.verificationStatus,
      },
    );
    if (!rows[0]) throw new AppError('Failed to create match stat', 500);
    return rows[0];
  }

  async findByMatch(matchId: string): Promise<MatchStat[]> {
    return query<MatchStat>(
      `SELECT * FROM "matchStats" WHERE "matchId" = :matchId`,
      { matchId },
    );
  }
}

// ─── Disputes ────────────────────────────────────────────────────────────────

export class DisputeRepository implements IDisputeRepository {
  async create(input: CreateDisputeData, client: CustomClient): Promise<Dispute> {
    const rows = await exec<Dispute>(
      client,
      `INSERT INTO disputes (
         "matchId", "openedByUserId", "openedBySide", reason,
         "claimedScoreA", "claimedScoreB"
       )
       VALUES (:matchId, :openedByUserId, :openedBySide, :reason, :claimedScoreA, :claimedScoreB)
       RETURNING *`,
      {
        matchId: input.matchId,
        openedByUserId: input.openedByUserId,
        openedBySide: input.openedBySide,
        reason: input.reason,
        claimedScoreA: input.claimedScoreA ?? null,
        claimedScoreB: input.claimedScoreB ?? null,
      },
    );
    if (!rows[0]) throw new AppError('Failed to create dispute', 500);
    return rows[0];
  }

  async findOpenForMatch(matchId: string): Promise<Dispute | null> {
    const [row] = await query<Dispute>(
      `SELECT * FROM disputes WHERE "matchId" = :matchId AND status = 'open' LIMIT 1`,
      { matchId },
    );
    return row ?? null;
  }

  async findById(id: string): Promise<Dispute | null> {
    const [row] = await query<Dispute>(
      `SELECT * FROM disputes WHERE id = :id`,
      { id },
    );
    return row ?? null;
  }
}
