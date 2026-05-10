import { hostname } from 'os';
import { randomUUID } from 'crypto';
import type { CustomClient } from '../../db.js';
import { query, transaction } from '../../db.js';
import type {
  IJobLockRepository,
  IJobRunRepository,
} from './scheduler.interface.js';

/**
 * Job pattern shared by every cron job in scheduler/jobs/. Each job exports
 * a JobDefinition; the runner picks them up at boot, registers cron tasks,
 * and on every fire calls runOnce() against the same lock + record flow.
 */
export interface JobDeps {
  query: typeof query;
  transaction: typeof transaction;
}

export interface JobResult {
  itemsProcessed: number;
  details?: Record<string, unknown>;
}

export interface JobDefinition {
  name: string;
  cronConfigKey: string;     // platformConfig key holding the cron expression
  defaultCronExpression: string;
  lockTtlSeconds: number;
  description: string;
  handler: (deps: JobDeps) => Promise<JobResult>;
}

export interface RunOnceResult {
  acquired: boolean;
  status?: 'success' | 'failure' | 'timeout';
  durationMs?: number;
  result?: JobResult;
  error?: string;
}

/**
 * Process identifier — used as the lockedBy on schedulerJobLocks rows so
 * different processes can tell their own locks apart.
 */
function makeRunnerId(): string {
  return `${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;
}

/**
 * Race a promise against a timeout. The timeout produces a tagged rejection
 * the runner translates into a `timeout` status; ordinary rejections become
 * `failure`. This matters for ops dashboards: a job that legitimately hits
 * its TTL is operationally different from one that crashed.
 */
class TimeoutError extends Error {
  constructor() { super('Job timed out'); this.name = 'TimeoutError'; }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new TimeoutError()), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

export class SchedulerRunner {
  private readonly runnerId = makeRunnerId();

  constructor(
    private readonly lockRepo: IJobLockRepository,
    private readonly runRepo: IJobRunRepository,
  ) {}

  /**
   * Acquire the lock, record a `running` run row, execute the handler with
   * a timeout, finalize the run row + lock book-keeping, release. If the
   * lock can't be acquired, return acquired=false and skip everything.
   */
  async runOnce(job: JobDefinition): Promise<RunOnceResult> {
    const lock = await this.lockRepo.tryAcquire(job.name, this.runnerId, job.lockTtlSeconds);
    if (!lock.acquired) return { acquired: false };

    const startedAt = new Date();
    const runId = await this.runRepo.start(job.name, startedAt);
    const start = Date.now();

    try {
      const result = await withTimeout(
        job.handler({ query, transaction }),
        job.lockTtlSeconds * 1000,
      );
      const completedAt = new Date();
      const durationMs = Date.now() - start;
      await this.runRepo.complete(runId, completedAt, 'success', durationMs, result, null);
      await this.lockRepo.recordRunResult(
        job.name, startedAt, completedAt, 'success', durationMs, null,
      );
      await this.lockRepo.release(job.name, this.runnerId);
      return { acquired: true, status: 'success', durationMs, result };
    } catch (err: unknown) {
      const completedAt = new Date();
      const durationMs = Date.now() - start;
      const isTimeout = err instanceof TimeoutError;
      const status: 'failure' | 'timeout' = isTimeout ? 'timeout' : 'failure';
      const message = err instanceof Error ? err.message : String(err);
      await this.runRepo.complete(runId, completedAt, status, durationMs, null, message);
      await this.lockRepo.recordRunResult(
        job.name, startedAt, completedAt, status, durationMs, message,
      );
      await this.lockRepo.release(job.name, this.runnerId);
      return { acquired: true, status, durationMs, error: message };
    }
  }

  get id(): string { return this.runnerId; }
}

/**
 * Read the cron expression for a job from platformConfig, falling back to
 * the job's default when the key is absent or unreadable. We don't fail
 * scheduler boot on a single missing config key.
 */
export async function resolveCronExpression(
  job: JobDefinition,
  getString: (key: string) => Promise<string>,
): Promise<string> {
  try {
    const v = await getString(job.cronConfigKey);
    return v || job.defaultCronExpression;
  } catch {
    return job.defaultCronExpression;
  }
}

/**
 * Light wrapper around node-cron's schedule() so the wiring code can be
 * exercised in tests without running a real timer. Implementations live
 * elsewhere; this file stays pure of the node-cron import for testability.
 */
export interface CronScheduler {
  schedule(expression: string, callback: () => void | Promise<void>, options?: { timezone?: string }): { stop: () => void };
  validate(expression: string): boolean;
}

/**
 * Pure-helper used by the boot integration and tests. Validates expression
 * is acceptable to the underlying scheduler.
 */
export function isValidCronExpression(scheduler: CronScheduler, expression: string): boolean {
  return scheduler.validate(expression);
}

// Re-export the lock client type so callers can pass a transaction client through.
export type { CustomClient };
