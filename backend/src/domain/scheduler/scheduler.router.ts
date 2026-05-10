import {
  router,
  protectedProcedureWithErrorHandling,
} from '../../presentation/trpc';
import {
  GetJobStatusInputSchema,
  GetRecentJobRunsInputSchema,
  TriggerJobInputSchema,
} from '@arena/shared';
import { SchedulerService } from './scheduler.service.js';
import { buildSchedulerSurface } from './scheduler.boot.js';

const surface = buildSchedulerSurface();
export const schedulerService = new SchedulerService(
  surface.registry, surface.lockRepo, surface.runRepo, surface.runner,
);

/**
 * Admin-only scheduler operations. Mounted under admin.scheduler.* by the
 * admin router. Per-procedure admin enforcement happens inside
 * SchedulerService via assertAdmin.
 */
export const adminSchedulerRouter = router({
  listJobs: protectedProcedureWithErrorHandling
    .query(async () => schedulerService.listJobs()),

  getJobStatus: protectedProcedureWithErrorHandling
    .input(GetJobStatusInputSchema)
    .query(async ({ input }) => schedulerService.getJobStatus(input.jobName)),

  getRecentRuns: protectedProcedureWithErrorHandling
    .input(GetRecentJobRunsInputSchema)
    .query(async ({ input }) => schedulerService.getRecentRuns(input.jobName, input.limit)),

  triggerJob: protectedProcedureWithErrorHandling
    .input(TriggerJobInputSchema)
    .mutation(async ({ ctx, input }) => schedulerService.triggerJobNow(input.jobName, ctx.user.id)),
});
