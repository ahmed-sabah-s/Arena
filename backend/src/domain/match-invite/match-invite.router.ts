import {
  router,
  publicProcedureWithErrorHandling,
  protectedProcedureWithErrorHandling,
} from '../../presentation/trpc';
import {
  CancelMatchInviteInputSchema,
  ClaimMatchInviteInputSchema,
  ConfirmClaimInputSchema,
  CreateMatchInviteInputSchema,
  PreviewMatchInviteInputSchema,
} from '@arena/shared';
import { config } from '../../shared/config';
import { MatchInviteRepository } from './match-invite.repository.js';
import { MatchInviteService } from './match-invite.service.js';
import { matchService } from '../match';

const repo = new MatchInviteRepository();
export const matchInviteService = new MatchInviteService(
  repo,
  matchService,
  config.JWT_SECRET,
);

export const matchInviteRouter = router({
  // Public preview — anyone with a code or QR can read non-sensitive details.
  preview: publicProcedureWithErrorHandling
    .input(PreviewMatchInviteInputSchema)
    .query(async ({ input }) => matchInviteService.previewInvite(input)),

  create: protectedProcedureWithErrorHandling
    .input(CreateMatchInviteInputSchema)
    .mutation(async ({ ctx, input }) => matchInviteService.createInvite(input, ctx.user.id)),

  claim: protectedProcedureWithErrorHandling
    .input(ClaimMatchInviteInputSchema)
    .mutation(async ({ ctx, input }) => matchInviteService.claimInvite(input, ctx.user.id)),

  confirmClaim: protectedProcedureWithErrorHandling
    .input(ConfirmClaimInputSchema)
    .mutation(async ({ ctx, input }) =>
      matchInviteService.confirmClaim(input.inviteId, ctx.user.id),
    ),

  cancel: protectedProcedureWithErrorHandling
    .input(CancelMatchInviteInputSchema)
    .mutation(async ({ ctx, input }) =>
      matchInviteService.cancelInvite(input.inviteId, ctx.user.id),
    ),

  // Admin/cron — Phase 8 wires a worker.
  expirePast: protectedProcedureWithErrorHandling
    .mutation(async () => matchInviteService.expirePastInvites()),
});
