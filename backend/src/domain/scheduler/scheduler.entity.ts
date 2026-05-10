export type JobRunStatus = 'running' | 'success' | 'failure' | 'timeout';

export interface SchedulerJobLock {
  jobName: string;
  lockedAt: Date;
  lockedBy: string;
  expiresAt: Date;
  lastRunStartedAt: Date | null;
  lastRunCompletedAt: Date | null;
  lastRunStatus: JobRunStatus | null;
  lastRunDurationMs: number | null;
  lastRunError: string | null;
}

export interface SchedulerJobRun {
  id: string;
  jobName: string;
  startedAt: Date;
  completedAt: Date | null;
  status: JobRunStatus;
  durationMs: number | null;
  result: unknown;
  error: string | null;
}
