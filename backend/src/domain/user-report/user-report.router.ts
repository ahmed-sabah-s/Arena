import {
  router,
  protectedProcedureWithErrorHandling,
} from '../../presentation/trpc';
import {
  FileUserReportInputSchema,
  GetUserReportByIdInputSchema,
  ListUserReportsInputSchema,
  ResolveUserReportInputSchema,
  SetReportUnderReviewInputSchema,
} from '@arena/shared';
import { z } from 'zod';
import { UserReportRepository } from './user-report.repository.js';
import { UserReportService } from './user-report.service.js';
import { notificationService } from '../notification';
import { auditLogService } from '../audit';

const repo = new UserReportRepository();
export const userReportService = new UserReportService(repo, notificationService, auditLogService);

export const userReportRouter = router({
  file: protectedProcedureWithErrorHandling
    .input(FileUserReportInputSchema)
    .mutation(async ({ ctx, input }) => userReportService.fileReport(input, ctx.user.id)),

  getMyFiled: protectedProcedureWithErrorHandling
    .input(z.object({ limit: z.number().int().positive().max(200).default(50) }).optional())
    .query(async ({ ctx, input }) => userReportService.getMyFiledReports(ctx.user.id, input?.limit)),

  getAgainstMe: protectedProcedureWithErrorHandling
    .input(z.object({ limit: z.number().int().positive().max(200).default(50) }).optional())
    .query(async ({ ctx, input }) => userReportService.getReportsAgainstMe(ctx.user.id, input?.limit)),
});

export const adminUserReportRouter = router({
  list: protectedProcedureWithErrorHandling
    .input(ListUserReportsInputSchema)
    .query(async ({ ctx, input }) => userReportService.listForAdmin(ctx.user.id, input)),

  getById: protectedProcedureWithErrorHandling
    .input(GetUserReportByIdInputSchema)
    .query(async ({ ctx, input }) =>
      userReportService.getByIdForAdmin(input.reportId, ctx.user.id),
    ),

  setUnderReview: protectedProcedureWithErrorHandling
    .input(SetReportUnderReviewInputSchema)
    .mutation(async ({ ctx, input }) =>
      userReportService.setUnderReview(input.reportId, ctx.user.id),
    ),

  resolve: protectedProcedureWithErrorHandling
    .input(ResolveUserReportInputSchema)
    .mutation(async ({ ctx, input }) =>
      userReportService.resolveReport(input.reportId, {
        outcome: input.outcome,
        resolution: input.resolution,
        resolutionNotes: input.resolutionNotes,
        actionTakenOnReported: input.actionTakenOnReported,
      }, ctx.user.id),
    ),
});
