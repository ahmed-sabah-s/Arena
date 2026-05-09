import {
  router,
  protectedProcedureWithErrorHandling,
  publicProcedureWithErrorHandling,
} from '../../presentation/trpc';
import {
  AddAvailabilityRuleInputSchema,
  AddBlackoutInputSchema,
  ApproveVenueInputSchema,
  ArchiveVenueInputSchema,
  CheckAvailabilityInputSchema,
  CreateVenueInputSchema,
  GetVenueByIdInputSchema,
  PauseVenueInputSchema,
  RejectVenueInputSchema,
  RemoveAvailabilityRuleInputSchema,
  RemoveBlackoutInputSchema,
  ResumeVenueInputSchema,
  SearchVenuesInCityInputSchema,
  UpdateVenueInputSchema,
  UpsertVenueGameConfigInputSchema,
} from '@arena/shared';
import {
  VenueAvailabilityRepository,
  VenueGameConfigRepository,
  VenueRepository,
} from './venue.repository.js';
import { VenueService } from './venue.service.js';
import { notificationService } from '../notification';
import { getConfigBoolean } from '../../shared/config/platformConfig/index.js';
import { TRPCError } from '@trpc/server';

const venueRepo = new VenueRepository();
const gameConfigRepo = new VenueGameConfigRepository();
const availabilityRepo = new VenueAvailabilityRepository();

export const venueService = new VenueService(
  venueRepo, gameConfigRepo, availabilityRepo, notificationService,
);

async function ensurePublicVenueListing(): Promise<void> {
  const enabled = await getConfigBoolean('public_venues_enabled');
  if (!enabled) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'PUBLIC_VENUES_DISABLED' });
  }
}

export const venueRouter = router({
  // ─── public reads (gated by public_venues_enabled flag) ──────────────────
  getById: publicProcedureWithErrorHandling
    .input(GetVenueByIdInputSchema)
    .query(async ({ ctx, input }) => {
      // Public access only allowed when the flag is on AND the venue is active.
      // Otherwise we route through the protected path which checks ownership.
      const callerId = ctx.user?.id ?? null;
      if (!callerId) await ensurePublicVenueListing();
      return venueService.getById(input.venueId, callerId);
    }),

  searchInCity: publicProcedureWithErrorHandling
    .input(SearchVenuesInCityInputSchema)
    .query(async ({ ctx, input }) => {
      if (!ctx.user) await ensurePublicVenueListing();
      return venueService.searchInCity(input.city);
    }),

  checkAvailabilityAt: publicProcedureWithErrorHandling
    .input(CheckAvailabilityInputSchema)
    .query(async ({ ctx, input }) => {
      if (!ctx.user) await ensurePublicVenueListing();
      return venueService.checkAvailabilityAt(input.venueId, input.timestamp);
    }),

  // ─── owner self-service ─────────────────────────────────────────────────
  create: protectedProcedureWithErrorHandling
    .input(CreateVenueInputSchema)
    .mutation(async ({ ctx, input }) => venueService.createVenue(input, ctx.user.id)),

  getMyVenues: protectedProcedureWithErrorHandling
    .query(async ({ ctx }) => venueService.getMyVenues(ctx.user.id)),

  update: protectedProcedureWithErrorHandling
    .input(UpdateVenueInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { venueId, ...partial } = input;
      return venueService.updateVenue(venueId, partial, ctx.user.id);
    }),

  pause: protectedProcedureWithErrorHandling
    .input(PauseVenueInputSchema)
    .mutation(async ({ ctx, input }) => venueService.pauseVenue(input.venueId, ctx.user.id)),

  resume: protectedProcedureWithErrorHandling
    .input(ResumeVenueInputSchema)
    .mutation(async ({ ctx, input }) => venueService.resumeVenue(input.venueId, ctx.user.id)),

  archive: protectedProcedureWithErrorHandling
    .input(ArchiveVenueInputSchema)
    .mutation(async ({ ctx, input }) => venueService.archiveVenue(input.venueId, ctx.user.id)),

  upsertGameConfig: protectedProcedureWithErrorHandling
    .input(UpsertVenueGameConfigInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { venueId, gameId, ...rest } = input;
      return venueService.upsertGameConfig(venueId, gameId, rest, ctx.user.id);
    }),

  addAvailabilityRule: protectedProcedureWithErrorHandling
    .input(AddAvailabilityRuleInputSchema)
    .mutation(async ({ ctx, input }) =>
      venueService.addAvailabilityRule(
        input.venueId, input.dayOfWeek, input.openTime, input.closeTime, ctx.user.id,
      ),
    ),

  removeAvailabilityRule: protectedProcedureWithErrorHandling
    .input(RemoveAvailabilityRuleInputSchema)
    .mutation(async ({ ctx, input }) =>
      venueService.removeAvailabilityRule(input.ruleId, ctx.user.id),
    ),

  addBlackout: protectedProcedureWithErrorHandling
    .input(AddBlackoutInputSchema)
    .mutation(async ({ ctx, input }) =>
      venueService.addBlackout(
        input.venueId, input.startsAt, input.endsAt, input.reason ?? null, ctx.user.id,
      ),
    ),

  removeBlackout: protectedProcedureWithErrorHandling
    .input(RemoveBlackoutInputSchema)
    .mutation(async ({ ctx, input }) =>
      venueService.removeBlackout(input.blackoutId, ctx.user.id),
    ),
});

/**
 * Admin-only venue operations. Mounted under admin.venue.* by admin.router.
 */
export const adminVenueRouter = router({
  approve: protectedProcedureWithErrorHandling
    .input(ApproveVenueInputSchema)
    .mutation(async ({ ctx, input }) => venueService.approveVenue(input.venueId, ctx.user.id)),

  reject: protectedProcedureWithErrorHandling
    .input(RejectVenueInputSchema)
    .mutation(async ({ ctx, input }) =>
      venueService.rejectVenue(input.venueId, ctx.user.id, input.reason),
    ),

  // listPendingApproval is intentionally a thin reader; the venue service exposes
  // admin-eligible reads via the same approval lifecycle.
  listPendingApproval: protectedProcedureWithErrorHandling
    .query(async ({ ctx }) => {
      // Admin enforcement happens inline via venue.service.assertAdmin in the
      // operations that mutate; for a list query the lighter path is to filter
      // by status server-side.
      const adminCheck = await import('../../db.js').then(({ query }) => query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM "userRole" ur JOIN role r ON r.id = ur."roleId"
           WHERE ur."userId" = :userId AND r.name = 'admin'
         ) AS exists`,
        { userId: ctx.user.id },
      ));
      if (!adminCheck[0]?.exists) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'NOT_ADMIN' });
      }
      const { query } = await import('../../db.js');
      return query<{ id: string; name: string; city: string; ownerUserId: string }>(
        `SELECT id, name, city, "ownerUserId"
         FROM venues
         WHERE status = 'pending_approval' AND "deletedAt" IS NULL
         ORDER BY "createdAt" ASC`,
      );
    }),
});
