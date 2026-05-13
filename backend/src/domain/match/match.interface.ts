import type { CustomClient } from '../../db.js';
import type {
  Dispute,
  Match,
  MatchCreationSource,
  MatchMode,
  MatchParticipant,
  MatchSide,
  MatchStakes,
  MatchStat,
  MatchStatLog,
  MatchStatus,
  MatchSubmission,
  StatVerificationStatus,
} from './match.entity.js';

// ─── Match ────────────────────────────────────────────────────────────────────

export interface CreateMatchData {
  gameId: string;
  formatId: string;
  divisionId: string | null;
  seasonId: string | null;
  matchMode: MatchMode;
  stakes: MatchStakes;
  venueId: string | null;
  scheduledAt: Date;
  creationSource: MatchCreationSource;
}

export interface IMatchRepository {
  create(input: CreateMatchData, client: CustomClient): Promise<Match>;
  findById(id: string): Promise<Match | null>;
  findByIdForUpdate(id: string, client: CustomClient): Promise<Match | null>;
  updateStatus(id: string, status: MatchStatus, client: CustomClient): Promise<Match>;
  setStarted(id: string, client: CustomClient): Promise<Match>;
  setCompleted(
    id: string,
    finalScoreA: number,
    finalScoreB: number,
    client: CustomClient,
  ): Promise<Match>;
  /** Count completed ranked matches between two teams within a window. */
  countRecentRankedMatchesBetweenTeams(
    teamA: string,
    teamB: string,
    withinDays: number,
  ): Promise<number>;
  /** Same for individual games (users). */
  countRecentRankedMatchesBetweenUsers(
    userA: string,
    userB: string,
    withinDays: number,
  ): Promise<number>;
  findScheduledForMatchmaker(
    gameId: string,
    formatId: string,
    divisionId: string | null,
  ): Promise<Match[]>;
  findAwaitingConfirmationOlderThan(hours: number): Promise<Match[]>;
}

// ─── Match Participants ──────────────────────────────────────────────────────

export interface CreateMatchParticipantData {
  matchId: string;
  side: MatchSide;
  teamId: string | null;
  userId: string | null;
  mmrAtMatch: number;
  eloAtMatch: number;
  matchesPlayedAtMatch: number;
}

export interface IMatchParticipantRepository {
  create(input: CreateMatchParticipantData, client: CustomClient): Promise<MatchParticipant>;
  findByMatchId(matchId: string, client?: CustomClient): Promise<MatchParticipant[]>;
  findByMatchAndSide(matchId: string, side: MatchSide, client?: CustomClient): Promise<MatchParticipant | null>;
  setStatKeeper(
    matchId: string,
    side: MatchSide,
    statKeeperUserId: string,
    client: CustomClient,
  ): Promise<MatchParticipant>;
  // Phase 8: snapshot the post-resolution ELO state on a participant so admin
  // overrides can reverse THIS match's contribution from the team/player
  // ELO row without trampling subsequent matches.
  setPostState(
    matchId: string,
    side: MatchSide,
    mmrAfterMatch: number,
    eloAfterMatch: number,
    matchesPlayedAfterMatch: number,
    client: CustomClient,
  ): Promise<MatchParticipant>;
}

// ─── Match Submissions ────────────────────────────────────────────────────────

export interface UpsertSubmissionData {
  matchId: string;
  side: MatchSide;
  submittedByUserId: string;
  scoreA: number;
  scoreB: number;
  notes?: string | null;
}

export interface IMatchSubmissionRepository {
  upsert(input: UpsertSubmissionData, client: CustomClient): Promise<MatchSubmission>;
  /** Optional client lets the caller read submissions inside their own transaction
   *  so a just-upserted row is visible. */
  findByMatch(matchId: string, client?: CustomClient): Promise<MatchSubmission[]>;
}

// ─── Stat Logs / Reconciled Stats ─────────────────────────────────────────────

export interface CreateStatLogData {
  matchId: string;
  loggedByUserId: string;
  side: MatchSide;
  statKey: string;
  statValue: unknown;
  minute?: number | null;
  playerId?: string | null;
}

export interface IMatchStatLogRepository {
  create(input: CreateStatLogData, client?: CustomClient): Promise<MatchStatLog>;
  findByMatch(matchId: string): Promise<MatchStatLog[]>;
}

export interface CreateMatchStatData {
  matchId: string;
  side: MatchSide;
  statKey: string;
  statValue: unknown;
  minute: number | null;
  playerId: string | null;
  verificationStatus: StatVerificationStatus;
}

export interface IMatchStatRepository {
  create(input: CreateMatchStatData, client: CustomClient): Promise<MatchStat>;
  findByMatch(matchId: string): Promise<MatchStat[]>;
}

// ─── Disputes ────────────────────────────────────────────────────────────────

export interface CreateDisputeData {
  matchId: string;
  openedByUserId: string;
  openedBySide: MatchSide;
  reason: string;
  claimedScoreA?: number | null;
  claimedScoreB?: number | null;
}

export interface IDisputeRepository {
  create(input: CreateDisputeData, client: CustomClient): Promise<Dispute>;
  findOpenForMatch(matchId: string): Promise<Dispute | null>;
  findById(id: string): Promise<Dispute | null>;
  // Phase 8 resolution flow.
  findByIdForUpdate(id: string, client: CustomClient): Promise<Dispute | null>;
  listOpen(limit: number): Promise<Dispute[]>;
  setResolved(
    id: string,
    resolution: string,
    resolutionNotes: string | null,
    resolvedByUserId: string,
    client: CustomClient,
  ): Promise<Dispute>;
  setDismissed(
    id: string,
    resolutionNotes: string,
    resolvedByUserId: string,
    client: CustomClient,
  ): Promise<Dispute>;
}
