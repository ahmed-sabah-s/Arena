import {
  router,
  protectedProcedureWithErrorHandling,
} from '../../presentation/trpc';
import {
  DismissDisputeInputSchema,
  GetDisputeByIdInputSchema,
  ResolveDisputeInputSchema,
} from '@arena/shared';
import { z } from 'zod';
import { DisputeService } from './dispute.service.js';
import {
  DisputeRepository,
  MatchParticipantRepository,
  MatchRepository,
  MatchStatRepository,
  MatchSubmissionRepository,
} from '../match/match.repository.js';
import { TeamEloRepository, PlayerEloRepository } from '../elo/elo.repository.js';
import { notificationService } from '../notification';
import { auditLogService } from '../audit';

export const disputeService = new DisputeService({
  disputeRepo: new DisputeRepository(),
  matchRepo: new MatchRepository(),
  participantRepo: new MatchParticipantRepository(),
  submissionRepo: new MatchSubmissionRepository(),
  statRepo: new MatchStatRepository(),
  teamEloRepo: new TeamEloRepository(),
  playerEloRepo: new PlayerEloRepository(),
  notificationService,
  auditLogService,
});

/**
 * Dispute resolution is admin-only — there's no player-side surface, so
 * everything mounts under admin.dispute.* via adminDisputeRouter.
 */
export const adminDisputeRouter = router({
  listOpen: protectedProcedureWithErrorHandling
    .input(z.object({ limit: z.number().int().positive().max(200).default(50) }).optional())
    .query(async ({ ctx, input }) => disputeService.listOpen(ctx.user.id, input?.limit)),

  getById: protectedProcedureWithErrorHandling
    .input(GetDisputeByIdInputSchema)
    .query(async ({ ctx, input }) =>
      disputeService.getDisputeContext(input.disputeId, ctx.user.id),
    ),

  resolve: protectedProcedureWithErrorHandling
    .input(ResolveDisputeInputSchema)
    .mutation(async ({ ctx, input }) =>
      disputeService.resolveDispute(input.disputeId, {
        resolution: input.resolution,
        notes: input.notes,
        scoreA: input.scoreA,
        scoreB: input.scoreB,
      }, ctx.user.id),
    ),

  dismiss: protectedProcedureWithErrorHandling
    .input(DismissDisputeInputSchema)
    .mutation(async ({ ctx, input }) =>
      disputeService.dismissDispute(input.disputeId, input.notes, ctx.user.id),
    ),
});
