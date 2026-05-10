import type {
  JobRunStatus,
  SchedulerJobLock,
  SchedulerJobRun,
} from './scheduler.entity.js';

export interface AcquireLockResult {
  acquired: boolean;
  lockedBy?: string;
}

export interface IJobLockRepository {
  /**
   * Try to acquire the lock. Inserts a row keyed on jobName, OR updates an
   * existing row when its expiresAt is in the past (stuck/abandoned lock).
   * Returns acquired=true only when the row's lockedBy matches what we sent.
   */
  tryAcquire(
    jobName: string,
    lockedBy: string,
    ttlSeconds: number,
  ): Promise<AcquireLockResult>;

  release(jobName: string, lockedBy: string): Promise<void>;

  recordRunResult(
    jobName: string,
    startedAt: Date,
    completedAt: Date,
    status: JobRunStatus,
    durationMs: number,
    error: string | null,
  ): Promise<void>;

  findByName(jobName: string): Promise<SchedulerJobLock | null>;
}

export interface IJobRunRepository {
  start(jobName: string, startedAt: Date): Promise<string>;
  complete(
    runId: string,
    completedAt: Date,
    status: JobRunStatus,
    durationMs: number,
    result: unknown,
    error: string | null,
  ): Promise<void>;
  findRecent(jobName: string | undefined, limit: number): Promise<SchedulerJobRun[]>;
}
