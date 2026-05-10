import { z } from 'zod';

export const JobRunStatusSchema = z.enum(['running', 'success', 'failure', 'timeout']);
export type JobRunStatus = z.infer<typeof JobRunStatusSchema>;

export const SchedulerJobLockSchema = z.object({
  jobName: z.string().max(100),
  lockedAt: z.coerce.date(),
  lockedBy: z.string().max(100),
  expiresAt: z.coerce.date(),
  lastRunStartedAt: z.coerce.date().nullable(),
  lastRunCompletedAt: z.coerce.date().nullable(),
  lastRunStatus: JobRunStatusSchema.nullable(),
  lastRunDurationMs: z.number().int().nullable(),
  lastRunError: z.string().nullable(),
});
export type SchedulerJobLock = z.infer<typeof SchedulerJobLockSchema>;

export const SchedulerJobRunSchema = z.object({
  id: z.string().uuid(),
  jobName: z.string().max(100),
  startedAt: z.coerce.date(),
  completedAt: z.coerce.date().nullable(),
  status: JobRunStatusSchema,
  durationMs: z.number().int().nullable(),
  result: z.unknown().nullable(),
  error: z.string().nullable(),
});
export type SchedulerJobRun = z.infer<typeof SchedulerJobRunSchema>;

// ─── inputs ─────────────────────────────────────────────────────────────────

export const TriggerJobInputSchema = z.object({
  jobName: z.string().min(1).max(100),
});
export type TriggerJobInput = z.infer<typeof TriggerJobInputSchema>;

export const GetJobStatusInputSchema = z.object({
  jobName: z.string().min(1).max(100),
});
export type GetJobStatusInput = z.infer<typeof GetJobStatusInputSchema>;

export const GetRecentJobRunsInputSchema = z.object({
  jobName: z.string().min(1).max(100).optional(),
  limit: z.number().int().positive().max(200).default(50),
});
export type GetRecentJobRunsInput = z.infer<typeof GetRecentJobRunsInputSchema>;
