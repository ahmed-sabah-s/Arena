import { z } from 'zod';

// MatchModeSchema is defined in game.schemas.ts as MatchModeSchema. We don't
// re-export here to avoid name collision; cross-import in TypeScript.

export const MatchStakesSchema = z.enum(['ranked', 'friendly']);
export type MatchStakes = z.infer<typeof MatchStakesSchema>;

export const MatchStatusSchema = z.enum([
  'scheduled',
  'active',
  'awaiting_confirmation',
  'completed',
  'disputed',
  'cancelled',
  'voided',
  'forfeited',
]);
export type MatchStatus = z.infer<typeof MatchStatusSchema>;

export const MatchSideSchema = z.enum(['A', 'B']);
export type MatchSide = z.infer<typeof MatchSideSchema>;

export const MatchCreationSourceSchema = z.enum(['queue', 'qr_invite', 'admin_created']);
export type MatchCreationSource = z.infer<typeof MatchCreationSourceSchema>;

export const StatVerificationStatusSchema = z.enum([
  'verified',
  'unverified',
  'referee_recorded',
]);
export type StatVerificationStatus = z.infer<typeof StatVerificationStatusSchema>;

// Match modes accepted at create time. Refereed handled in Phase 6.
export const MatchModeForCreationSchema = z.enum(['player_stats', 'score_only', 'refereed']);
export type MatchModeForCreation = z.infer<typeof MatchModeForCreationSchema>;

// ─── entity schemas ──────────────────────────────────────────────────────────

export const MatchSchema = z.object({
  id: z.string().uuid(),
  gameId: z.string().uuid(),
  formatId: z.string().uuid(),
  divisionId: z.string().uuid().nullable(),
  seasonId: z.string().uuid().nullable(),
  matchMode: MatchModeForCreationSchema,
  stakes: MatchStakesSchema,
  status: MatchStatusSchema,
  venueId: z.string().uuid().nullable(),
  scheduledAt: z.coerce.date(),
  startedAt: z.coerce.date().nullable(),
  completedAt: z.coerce.date().nullable(),
  finalScoreA: z.number().int().nullable(),
  finalScoreB: z.number().int().nullable(),
  creationSource: MatchCreationSourceSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Match = z.infer<typeof MatchSchema>;

export const MatchParticipantSchema = z.object({
  id: z.string().uuid(),
  matchId: z.string().uuid(),
  side: MatchSideSchema,
  teamId: z.string().uuid().nullable(),
  userId: z.string().uuid().nullable(),
  statKeeperUserId: z.string().uuid().nullable(),
  mmrAtMatch: z.number().int(),
  eloAtMatch: z.number().int(),
  matchesPlayedAtMatch: z.number().int().nonnegative(),
});
export type MatchParticipant = z.infer<typeof MatchParticipantSchema>;

export const MatchSubmissionSchema = z.object({
  id: z.string().uuid(),
  matchId: z.string().uuid(),
  side: MatchSideSchema,
  submittedByUserId: z.string().uuid(),
  scoreA: z.number().int().nonnegative(),
  scoreB: z.number().int().nonnegative(),
  submittedAt: z.coerce.date(),
  notes: z.string().nullable(),
});
export type MatchSubmission = z.infer<typeof MatchSubmissionSchema>;

export const MatchStatLogSchema = z.object({
  id: z.string().uuid(),
  matchId: z.string().uuid(),
  loggedByUserId: z.string().uuid(),
  side: MatchSideSchema,
  statKey: z.string().max(50),
  statValue: z.unknown(),
  minute: z.number().int().nonnegative().nullable(),
  playerId: z.string().uuid().nullable(),
  recordedAt: z.coerce.date(),
});
export type MatchStatLog = z.infer<typeof MatchStatLogSchema>;

export const MatchStatSchema = z.object({
  id: z.string().uuid(),
  matchId: z.string().uuid(),
  side: MatchSideSchema,
  statKey: z.string().max(50),
  statValue: z.unknown(),
  minute: z.number().int().nonnegative().nullable(),
  playerId: z.string().uuid().nullable(),
  verificationStatus: StatVerificationStatusSchema,
  createdAt: z.coerce.date(),
});
export type MatchStat = z.infer<typeof MatchStatSchema>;

// ─── input schemas ───────────────────────────────────────────────────────────

export const StartMatchInputSchema = z.object({
  matchId: z.string().uuid(),
});
export type StartMatchInput = z.infer<typeof StartMatchInputSchema>;

export const DesignateStatKeeperInputSchema = z.object({
  matchId: z.string().uuid(),
  statKeeperUserId: z.string().uuid(),
});
export type DesignateStatKeeperInput = z.infer<typeof DesignateStatKeeperInputSchema>;

export const LogMatchStatInputSchema = z.object({
  matchId: z.string().uuid(),
  side: MatchSideSchema,
  statKey: z.string().min(1).max(50),
  statValue: z.unknown(),
  minute: z.number().int().nonnegative().optional(),
  playerId: z.string().uuid().optional(),
});
export type LogMatchStatInput = z.infer<typeof LogMatchStatInputSchema>;

export const SubmitMatchResultInputSchema = z.object({
  matchId: z.string().uuid(),
  scoreA: z.number().int().nonnegative(),
  scoreB: z.number().int().nonnegative(),
  notes: z.string().max(500).optional(),
});
export type SubmitMatchResultInput = z.infer<typeof SubmitMatchResultInputSchema>;

export const ConfirmOpposingResultInputSchema = z.object({
  matchId: z.string().uuid(),
});
export type ConfirmOpposingResultInput = z.infer<typeof ConfirmOpposingResultInputSchema>;

export const DisputeResultInputSchema = z.object({
  matchId: z.string().uuid(),
  reason: z.string().min(1).max(2000),
  claimedScoreA: z.number().int().nonnegative().optional(),
  claimedScoreB: z.number().int().nonnegative().optional(),
});
export type DisputeResultInput = z.infer<typeof DisputeResultInputSchema>;

export const GetMatchInputSchema = z.object({
  matchId: z.string().uuid(),
});
export type GetMatchInput = z.infer<typeof GetMatchInputSchema>;

// ─── Phase 8: admin overrides ──────────────────────────────────────────────

export const AdminCancelMatchInputSchema = z.object({
  matchId: z.string().uuid(),
  reason: z.string().min(1).max(2000),
});
export type AdminCancelMatchInput = z.infer<typeof AdminCancelMatchInputSchema>;

export const AdminOverrideMatchResultInputSchema = z.object({
  matchId: z.string().uuid(),
  scoreA: z.number().int().nonnegative(),
  scoreB: z.number().int().nonnegative(),
  reason: z.string().min(1).max(2000),
});
export type AdminOverrideMatchResultInput = z.infer<typeof AdminOverrideMatchResultInputSchema>;
