import { query } from '../../db.js';
import {
  AuthorizationError,
  NotFoundError,
} from '../../shared/errors/index.js';
import type {
  SchedulerJobLock,
  SchedulerJobRun,
} from './scheduler.entity.js';
import type {
  IJobLockRepository,
  IJobRunRepository,
} from './scheduler.interface.js';
import type {
  JobDefinition,
  RunOnceResult,
  SchedulerRunner,
} from './scheduler.runner.js';

/**
 * Admin-side surface: list registered jobs, inspect lock + recent run rows,
 * and manually trigger a job out-of-cycle. The manual trigger goes through
 * the same lock + record flow as a scheduled fire, so an in-progress job
 * isn't double-run by an impatient admin.
 */
export class SchedulerService {
  constructor(
    private readonly registry: JobDefinition[],
    private readonly lockRepo: IJobLockRepository,
    private readonly runRepo: IJobRunRepository,
    private readonly runner: SchedulerRunner,
  ) {}

  listJobs(): Array<Pick<JobDefinition, 'name' | 'cronConfigKey' | 'defaultCronExpression' | 'lockTtlSeconds' | 'description'>> {
    return this.registry.map(({ name, cronConfigKey, defaultCronExpression, lockTtlSeconds, description }) => ({
      name, cronConfigKey, defaultCronExpression, lockTtlSeconds, description,
    }));
  }

  async getJobStatus(jobName: string): Promise<SchedulerJobLock> {
    const lock = await this.lockRepo.findByName(jobName);
    if (!lock) throw new NotFoundError('SchedulerJobLock');
    return lock;
  }

  async getRecentRuns(jobName: string | undefined, limit = 50): Promise<SchedulerJobRun[]> {
    return this.runRepo.findRecent(jobName, limit);
  }

  async triggerJobNow(jobName: string, byAdminUserId: string): Promise<RunOnceResult> {
    await this.assertAdmin(byAdminUserId);
    const job = this.registry.find((j) => j.name === jobName);
    if (!job) throw new NotFoundError('JobDefinition');
    return this.runner.runOnce(job);
  }

  private async assertAdmin(userId: string): Promise<void> {
    const [row] = await query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM "userRole" ur
         JOIN role r ON r.id = ur."roleId"
         WHERE ur."userId" = :userId AND r.name = 'admin'
       ) AS exists`,
      { userId },
    );
    if (!row?.exists) throw new AuthorizationError('NOT_ADMIN');
  }
}
