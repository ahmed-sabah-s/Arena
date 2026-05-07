import {
  router,
  protectedProcedureWithErrorHandling,
} from '../../presentation/trpc';
import {
  AcceptFriendlyInputSchema,
  EnqueueInputSchema,
  LeaveQueueInputSchema,
  RunMatchmakingPassInputSchema,
} from '@arena/shared';
import { MatchmakingService } from './matchmaking.service.js';
import { matchService } from '../match';
import { TeamEloRepository, PlayerEloRepository, EloService } from '../elo';

const teamEloRepo = new TeamEloRepository();
const playerEloRepo = new PlayerEloRepository();
const eloService = new EloService(teamEloRepo, playerEloRepo);

export const matchmakingService = new MatchmakingService(
  matchService,
  teamEloRepo,
  playerEloRepo,
  eloService,
);

// Registered as `queue` in _app.ts for clearer API naming.
export const queueRouter = router({
  enqueue: protectedProcedureWithErrorHandling
    .input(EnqueueInputSchema)
    .mutation(async ({ ctx, input }) =>
      matchmakingService.enqueue(input, ctx.user.id),
    ),

  leave: protectedProcedureWithErrorHandling
    .input(LeaveQueueInputSchema)
    .mutation(async ({ ctx, input }) =>
      matchmakingService.leaveQueue(input.entryId, ctx.user.id),
    ),

  myStatus: protectedProcedureWithErrorHandling
    .query(async ({ ctx }) => matchmakingService.getMyQueueStatus(ctx.user.id)),

  acceptFriendly: protectedProcedureWithErrorHandling
    .input(AcceptFriendlyInputSchema)
    .mutation(async ({ ctx, input }) =>
      matchmakingService.acceptFriendly(input.entryId, ctx.user.id),
    ),

  // Admin / Phase 8 worker endpoint. Run a pass over a scope.
  runPass: protectedProcedureWithErrorHandling
    .input(RunMatchmakingPassInputSchema)
    .mutation(async ({ input }) =>
      matchmakingService.runMatchmakingPass({
        gameId: input.gameId,
        formatId: input.formatId,
        divisionId: input.divisionId ?? null,
      }),
    ),
});
