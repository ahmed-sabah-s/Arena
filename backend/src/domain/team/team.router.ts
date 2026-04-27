import { z } from 'zod';
import {
  router,
  publicProcedureWithErrorHandling,
  protectedProcedureWithErrorHandling,
} from '../../presentation/trpc';
import {
  CreateTeamInputSchema,
  UpdateTeamInputSchema,
  TransferCaptaincyInputSchema,
  DisbandTeamInputSchema,
  InviteTeamMemberInputSchema,
  AcceptInviteInputSchema,
  DeclineInviteInputSchema,
  CancelInviteInputSchema,
  ReleaseMemberInputSchema,
  LeaveTeamInputSchema,
  UpdateMemberInputSchema,
} from '@arena/shared';
import {
  TeamRepository,
  TeamMemberRepository,
  TeamInviteRepository,
  TeamCreationLogRepository,
} from './team.repository.js';
import { TeamService } from './team.service.js';

const teamRepo = new TeamRepository();
const memberRepo = new TeamMemberRepository();
const inviteRepo = new TeamInviteRepository();
const logRepo = new TeamCreationLogRepository();
const teamService = new TeamService(teamRepo, memberRepo, inviteRepo, logRepo);

export const teamRouter = router({
  // ── reads ──────────────────────────────────────────────────────────────
  getById: publicProcedureWithErrorHandling
    .input(z.string().uuid())
    .query(async ({ input }) => teamService.getTeam(input)),

  getMyTeams: protectedProcedureWithErrorHandling
    .query(async ({ ctx }) => teamService.getMyTeams(ctx.user.id)),

  getMyInvites: protectedProcedureWithErrorHandling
    .query(async ({ ctx }) => teamService.getMyInvites(ctx.user.id)),

  getTeamInvites: protectedProcedureWithErrorHandling
    .input(z.object({ teamId: z.string().uuid() }))
    .query(async ({ ctx, input }) => teamService.getTeamInvites(input.teamId, ctx.user.id)),

  // ── mutations ──────────────────────────────────────────────────────────
  create: protectedProcedureWithErrorHandling
    .input(CreateTeamInputSchema)
    .mutation(async ({ ctx, input }) => teamService.createTeam(input, ctx.user.id)),

  update: protectedProcedureWithErrorHandling
    .input(UpdateTeamInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { teamId, ...partial } = input;
      return teamService.updateTeam(teamId, partial, ctx.user.id);
    }),

  transferCaptaincy: protectedProcedureWithErrorHandling
    .input(TransferCaptaincyInputSchema)
    .mutation(async ({ ctx, input }) => {
      await teamService.transferCaptaincy(input.teamId, input.newCaptainUserId, ctx.user.id);
      return { success: true };
    }),

  disband: protectedProcedureWithErrorHandling
    .input(DisbandTeamInputSchema)
    .mutation(async ({ ctx, input }) => {
      await teamService.disbandTeam(input.teamId, ctx.user.id, input.reason);
      return { success: true };
    }),

  invite: protectedProcedureWithErrorHandling
    .input(InviteTeamMemberInputSchema)
    .mutation(async ({ ctx, input }) => teamService.inviteMember(input, ctx.user.id)),

  acceptInvite: protectedProcedureWithErrorHandling
    .input(AcceptInviteInputSchema)
    .mutation(async ({ ctx, input }) => teamService.acceptInvite(input.inviteId, ctx.user.id)),

  declineInvite: protectedProcedureWithErrorHandling
    .input(DeclineInviteInputSchema)
    .mutation(async ({ ctx, input }) => {
      await teamService.declineInvite(input.inviteId, ctx.user.id);
      return { success: true };
    }),

  cancelInvite: protectedProcedureWithErrorHandling
    .input(CancelInviteInputSchema)
    .mutation(async ({ ctx, input }) => {
      await teamService.cancelInvite(input.inviteId, ctx.user.id);
      return { success: true };
    }),

  leave: protectedProcedureWithErrorHandling
    .input(LeaveTeamInputSchema)
    .mutation(async ({ ctx, input }) => {
      await teamService.leaveTeam(input.teamId, ctx.user.id);
      return { success: true };
    }),

  releaseMember: protectedProcedureWithErrorHandling
    .input(ReleaseMemberInputSchema)
    .mutation(async ({ ctx, input }) => {
      await teamService.releaseMember(input.teamId, input.userId, ctx.user.id);
      return { success: true };
    }),

  updateMember: protectedProcedureWithErrorHandling
    .input(UpdateMemberInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { teamId, userId, ...partial } = input;
      return teamService.updateMember(teamId, userId, partial, ctx.user.id);
    }),
});
