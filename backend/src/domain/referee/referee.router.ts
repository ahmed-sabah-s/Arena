import {
  router,
  protectedProcedureWithErrorHandling,
} from '../../presentation/trpc';
import {
  AssignRefereeInputSchema,
  CertifyRefereeInputSchema,
  CheckInInputSchema,
  DeclareConflictInputSchema,
  FlagRefereeInputSchema,
  ReclaimMainSlotInputSchema,
  RemoveConflictInputSchema,
  RespondToAssignmentInputSchema,
  RevokeCertificationInputSchema,
  StartRefereedMatchInputSchema,
  SubmitRefereedResultInputSchema,
  TriggerAutoPromotionInputSchema,
  TriggerCheckInWindowInputSchema,
  UpdateRefereeProfileInputSchema,
} from '@arena/shared';
import {
  RefereeAssignmentRepository,
  RefereeCaptainFlagRepository,
  RefereeCertificationRepository,
  RefereeConflictRepository,
  RefereeProfileRepository,
} from './referee.repository.js';
import { RefereeProfileService } from './referee.profile.service.js';
import { RefereeConflictService } from './referee.conflict.service.js';
import { RefereeAssignmentService } from './referee.assignment.service.js';
import {
  MatchRepository,
  MatchParticipantRepository,
  MatchStatRepository,
} from '../match/match.repository.js';
import { TeamEloRepository, PlayerEloRepository } from '../elo/elo.repository.js';
import { notificationService } from '../notification';

const profileRepo = new RefereeProfileRepository();
const certRepo = new RefereeCertificationRepository();
const conflictRepo = new RefereeConflictRepository();
const assignmentRepo = new RefereeAssignmentRepository();
const flagRepo = new RefereeCaptainFlagRepository();

export const refereeProfileService = new RefereeProfileService(profileRepo, certRepo);
export const refereeConflictService = new RefereeConflictService(conflictRepo);
export const refereeAssignmentService = new RefereeAssignmentService({
  assignmentRepo,
  profileRepo,
  flagRepo,
  matchRepo: new MatchRepository(),
  participantRepo: new MatchParticipantRepository(),
  matchStatRepo: new MatchStatRepository(),
  teamEloRepo: new TeamEloRepository(),
  playerEloRepo: new PlayerEloRepository(),
  profileService: refereeProfileService,
  conflictService: refereeConflictService,
  notificationService,
});

export const refereeRouter = router({
  // ─── self-service (referee role) ────────────────────────────────────────
  getMyProfile: protectedProcedureWithErrorHandling
    .query(async ({ ctx }) => refereeProfileService.getMyProfile(ctx.user.id)),

  updateMyProfile: protectedProcedureWithErrorHandling
    .input(UpdateRefereeProfileInputSchema)
    .mutation(async ({ ctx, input }) =>
      refereeProfileService.updateProfile(ctx.user.id, input),
    ),

  declareConflict: protectedProcedureWithErrorHandling
    .input(DeclareConflictInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (input.conflictedTeamId) {
        return refereeConflictService.declareTeamConflict(
          ctx.user.id, input.conflictedTeamId, input.reason,
        );
      }
      // Schema's refine guarantees the user variant when team is missing.
      return refereeConflictService.declareUserConflict(
        ctx.user.id, input.conflictedUserId!, input.reason,
      );
    }),

  removeConflict: protectedProcedureWithErrorHandling
    .input(RemoveConflictInputSchema)
    .mutation(async ({ ctx, input }) =>
      refereeConflictService.removeConflict(input.conflictId, ctx.user.id),
    ),

  getMyConflicts: protectedProcedureWithErrorHandling
    .query(async ({ ctx }) => refereeConflictService.listMyConflicts(ctx.user.id)),

  getMyAssignments: protectedProcedureWithErrorHandling
    .query(async ({ ctx }) => refereeAssignmentService.getMyAssignments(ctx.user.id)),

  respondToAssignment: protectedProcedureWithErrorHandling
    .input(RespondToAssignmentInputSchema)
    .mutation(async ({ ctx, input }) =>
      refereeAssignmentService.respondToAssignment(
        input.assignmentId, input.accept, ctx.user.id, input.declineReason,
      ),
    ),

  checkIn: protectedProcedureWithErrorHandling
    .input(CheckInInputSchema)
    .mutation(async ({ ctx, input }) =>
      refereeAssignmentService.checkIn(input.assignmentId, ctx.user.id),
    ),

  startMatch: protectedProcedureWithErrorHandling
    .input(StartRefereedMatchInputSchema)
    .mutation(async ({ ctx, input }) =>
      refereeAssignmentService.startMatch(input.matchId, ctx.user.id),
    ),

  submitResult: protectedProcedureWithErrorHandling
    .input(SubmitRefereedResultInputSchema)
    .mutation(async ({ ctx, input }) =>
      refereeAssignmentService.submitRefereedResult(input, ctx.user.id),
    ),

  reclaimMainSlot: protectedProcedureWithErrorHandling
    .input(ReclaimMainSlotInputSchema)
    .mutation(async ({ ctx, input }) =>
      refereeAssignmentService.reclaimMainSlot(input.assignmentId, ctx.user.id),
    ),

  // Captain calls this from the match-detail page after a refereed match.
  flagFromCaptain: protectedProcedureWithErrorHandling
    .input(FlagRefereeInputSchema)
    .mutation(async ({ ctx, input }) =>
      refereeAssignmentService.flagReferee(
        input.matchId, input.refereeUserId, ctx.user.id, input.reason, input.description,
      ),
    ),
});

/**
 * Admin-only referee operations. Lives under the `admin.referee.*` namespace
 * because Phase 8 will fold these into a broader admin router; for Phase 6
 * we surface them as a small dedicated sub-router so the surface is explicit.
 */
export const adminRefereeRouter = router({
  assign: protectedProcedureWithErrorHandling
    .input(AssignRefereeInputSchema)
    .mutation(async ({ ctx, input }) =>
      refereeAssignmentService.assignReferee(
        input.matchId, input.refereeUserId, input.role, ctx.user.id,
      ),
    ),

  certify: protectedProcedureWithErrorHandling
    .input(CertifyRefereeInputSchema)
    .mutation(async ({ ctx, input }) =>
      refereeProfileService.certifyForGame(
        input.userId, input.gameId, ctx.user.id, input.notes,
      ),
    ),

  revokeCertification: protectedProcedureWithErrorHandling
    .input(RevokeCertificationInputSchema)
    .mutation(async ({ ctx, input }) =>
      refereeProfileService.revokeCertification(
        input.userId, input.gameId, ctx.user.id, input.reason,
      ),
    ),

  triggerCheckInWindow: protectedProcedureWithErrorHandling
    .input(TriggerCheckInWindowInputSchema)
    .mutation(async ({ ctx, input }) =>
      refereeAssignmentService.triggerCheckInWindow(input.matchId, ctx.user.id),
    ),

  triggerAutoPromotion: protectedProcedureWithErrorHandling
    .input(TriggerAutoPromotionInputSchema)
    .mutation(async ({ ctx, input }) =>
      refereeAssignmentService.triggerAutoPromotion(input.matchId, ctx.user.id),
    ),
});
