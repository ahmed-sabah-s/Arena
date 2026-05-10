import { query } from '../../db.js';
import { AppError } from '../../shared/errors/index.js';
import type {
  JobRunStatus,
  SchedulerJobLock,
  SchedulerJobRun,
} from './scheduler.entity.js';
import type {
  AcquireLockResult,
  IJobLockRepository,
  IJobRunRepository,
} from './scheduler.interface.js';

export class JobLockRepository implements IJobLockRepository {
  /**
   * The pattern: INSERT … ON CONFLICT … DO UPDATE … WHERE expiresAt < NOW()
   * RETURNING. If we either inserted (no prior row) or updated a stale row,
   * the RETURNING gives us a row. If a non-stale row already existed, the
   * WHERE in the UPDATE clause prevents the update and RETURNING gives no
   * row — meaning someone else holds a fresh lock.
   *
   * We compare the returned `lockedBy` against what we sent: matches → we
   * own the lock; doesn't → spurious update by another fresh-acquire path
   * (shouldn't happen with the WHERE clause, but defensive).
   */
  async tryAcquire(
    jobName: string,
    lockedBy: string,
    ttlSeconds: number,
  ): Promise<AcquireLockResult> {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const rows = await query<{ lockedBy: string }>(
      `INSERT INTO "schedulerJobLocks" ("jobName", "lockedAt", "lockedBy", "expiresAt")
       VALUES (:jobName, CURRENT_TIMESTAMP, :lockedBy, :expiresAt)
       ON CONFLICT ("jobName") DO UPDATE
         SET "lockedAt" = EXCLUDED."lockedAt",
             "lockedBy" = EXCLUDED."lockedBy",
             "expiresAt" = EXCLUDED."expiresAt"
         WHERE "schedulerJobLocks"."expiresAt" < CURRENT_TIMESTAMP
       RETURNING "lockedBy"`,
      { jobName, lockedBy, expiresAt },
    );
    if (rows.length === 0) return { acquired: false };
    return { acquired: rows[0].lockedBy === lockedBy, lockedBy: rows[0].lockedBy };
  }

  /**
   * Release the lock by setting expiresAt into the past. We don't DELETE so
   * the lastRun* fields stay around for ops observability.
   */
  async release(jobName: string, lockedBy: string): Promise<void> {
    await query(
      `UPDATE "schedulerJobLocks"
       SET "expiresAt" = CURRENT_TIMESTAMP - INTERVAL '1 second'
       WHERE "jobName" = :jobName AND "lockedBy" = :lockedBy`,
      { jobName, lockedBy },
    );
  }

  async recordRunResult(
    jobName: string,
    startedAt: Date,
    completedAt: Date,
    status: JobRunStatus,
    durationMs: number,
    error: string | null,
  ): Promise<void> {
    await query(
      `UPDATE "schedulerJobLocks"
       SET "lastRunStartedAt" = :startedAt,
           "lastRunCompletedAt" = :completedAt,
           "lastRunStatus" = :status,
           "lastRunDurationMs" = :durationMs,
           "lastRunError" = :error
       WHERE "jobName" = :jobName`,
      { jobName, startedAt, completedAt, status, durationMs, error },
    );
  }

  async findByName(jobName: string): Promise<SchedulerJobLock | null> {
    const [row] = await query<SchedulerJobLock>(
      `SELECT * FROM "schedulerJobLocks" WHERE "jobName" = :jobName`,
      { jobName },
    );
    return row ?? null;
  }
}

export class JobRunRepository implements IJobRunRepository {
  async start(jobName: string, startedAt: Date): Promise<string> {
    const [row] = await query<{ id: string }>(
      `INSERT INTO "schedulerJobRuns" ("jobName", "startedAt", status)
       VALUES (:jobName, :startedAt, 'running')
       RETURNING id`,
      { jobName, startedAt },
    );
    if (!row) throw new AppError('Failed to start job run', 500);
    return row.id;
  }

  async complete(
    runId: string,
    completedAt: Date,
    status: JobRunStatus,
    durationMs: number,
    result: unknown,
    error: string | null,
  ): Promise<void> {
    await query(
      `UPDATE "schedulerJobRuns"
       SET "completedAt" = :completedAt,
           status = :status,
           "durationMs" = :durationMs,
           result = :result,
           error = :error
       WHERE id = :runId`,
      {
        runId, completedAt, status, durationMs,
        result: result == null ? null : JSON.stringify(result),
        error,
      },
    );
  }

  async findRecent(jobName: string | undefined, limit: number): Promise<SchedulerJobRun[]> {
    if (jobName) {
      return query<SchedulerJobRun>(
        `SELECT * FROM "schedulerJobRuns"
         WHERE "jobName" = :jobName
         ORDER BY "startedAt" DESC
         LIMIT :limit`,
        { jobName, limit },
      );
    }
    return query<SchedulerJobRun>(
      `SELECT * FROM "schedulerJobRuns"
       ORDER BY "startedAt" DESC
       LIMIT :limit`,
      { limit },
    );
  }
}
