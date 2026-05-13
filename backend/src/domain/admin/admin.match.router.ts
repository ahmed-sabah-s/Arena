import {
  router,
  protectedProcedureWithErrorHandling,
} from '../../presentation/trpc';
import {
  AdminCancelMatchInputSchema,
  AdminOverrideMatchResultInputSchema,
} from '@arena/shared';
import { AdminMatchService } from './admin.match.service.js';
import {
  MatchParticipantRepository,
  MatchRepository,
  MatchStatRepository,
  MatchSubmissionRepository,
} from '../match/match.repository.js';
import { TeamEloRepository, PlayerEloRepository } from '../elo/elo.repository.js';
import { notificationService } from '../notification';
import { auditLogService } from '../audit';

export const adminMatchService = new AdminMatchService({
  matchRepo: new MatchRepository(),
  participantRepo: new MatchParticipantRepository(),
  submissionRepo: new MatchSubmissionRepository(),
  statRepo: new MatchStatRepository(),
  teamEloRepo: new TeamEloRepository(),
  playerEloRepo: new PlayerEloRepository(),
  notificationService,
  auditLogService,
});

export const adminMatchRouter = router({
  cancelMatch: protectedProcedureWithErrorHandling
    .input(AdminCancelMatchInputSchema)
    .mutation(async ({ ctx, input }) =>
      adminMatchService.cancelMatch(input.matchId, input.reason, ctx.user.id),
    ),

  overrideResult: protectedProcedureWithErrorHandling
    .input(AdminOverrideMatchResultInputSchema)
    .mutation(async ({ ctx, input }) =>
      adminMatchService.overrideResult(
        input.matchId, input.scoreA, input.scoreB, input.reason, ctx.user.id,
      ),
    ),
});
