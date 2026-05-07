import {
  router,
  protectedProcedureWithErrorHandling,
} from '../../presentation/trpc';
import {
  ConfirmOpposingResultInputSchema,
  DesignateStatKeeperInputSchema,
  DisputeResultInputSchema,
  GetMatchInputSchema,
  LogMatchStatInputSchema,
  StartMatchInputSchema,
  SubmitMatchResultInputSchema,
} from '@arena/shared';
import {
  DisputeRepository,
  MatchParticipantRepository,
  MatchRepository,
  MatchStatLogRepository,
  MatchStatRepository,
  MatchSubmissionRepository,
} from './match.repository.js';
import { MatchService } from './match.service.js';
import { TeamEloRepository, PlayerEloRepository } from '../elo';
import { notificationService } from '../notification';

const matchRepo = new MatchRepository();
const participantRepo = new MatchParticipantRepository();
const submissionRepo = new MatchSubmissionRepository();
const statLogRepo = new MatchStatLogRepository();
const statRepo = new MatchStatRepository();
const disputeRepo = new DisputeRepository();
const teamEloRepo = new TeamEloRepository();
const playerEloRepo = new PlayerEloRepository();

export const matchService = new MatchService(
  matchRepo,
  participantRepo,
  submissionRepo,
  statLogRepo,
  statRepo,
  disputeRepo,
  teamEloRepo,
  playerEloRepo,
  notificationService,
);

export const matchRouter = router({
  getById: protectedProcedureWithErrorHandling
    .input(GetMatchInputSchema)
    .query(async ({ input }) => matchService.getMatch(input.matchId)),

  start: protectedProcedureWithErrorHandling
    .input(StartMatchInputSchema)
    .mutation(async ({ ctx, input }) => matchService.startMatch(input.matchId, ctx.user.id)),

  designateStatKeeper: protectedProcedureWithErrorHandling
    .input(DesignateStatKeeperInputSchema)
    .mutation(async ({ ctx, input }) =>
      matchService.designateStatKeeper(input.matchId, input.statKeeperUserId, ctx.user.id),
    ),

  logStat: protectedProcedureWithErrorHandling
    .input(LogMatchStatInputSchema)
    .mutation(async ({ ctx, input }) => {
      await matchService.logMatchStat(input, ctx.user.id);
      return { success: true };
    }),

  submitResult: protectedProcedureWithErrorHandling
    .input(SubmitMatchResultInputSchema)
    .mutation(async ({ ctx, input }) => matchService.submitMatchResult(input, ctx.user.id)),

  confirmResult: protectedProcedureWithErrorHandling
    .input(ConfirmOpposingResultInputSchema)
    .mutation(async ({ ctx, input }) =>
      matchService.confirmOpposingResult(input.matchId, ctx.user.id),
    ),

  dispute: protectedProcedureWithErrorHandling
    .input(DisputeResultInputSchema)
    .mutation(async ({ ctx, input }) => matchService.disputeResult(input, ctx.user.id)),

  // Admin endpoint (no permission gate yet — Phase 8 admin-protect).
  runForfeitSweep: protectedProcedureWithErrorHandling
    .mutation(async () => matchService.applyForfeitWindow()),
});
