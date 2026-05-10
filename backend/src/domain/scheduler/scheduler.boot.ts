import cron from 'node-cron';
import { getConfigString } from '../../shared/config/platformConfig/index.js';
import { jobRegistry } from './jobs/index.js';
import { JobLockRepository, JobRunRepository } from './scheduler.repository.js';
import {
  SchedulerRunner,
  resolveCronExpression,
  type JobDefinition,
} from './scheduler.runner.js';

let started = false;
const scheduledTasks: Array<{ jobName: string; task: { stop: () => void } }> = [];

/**
 * Boot the in-process cron scheduler. Each registered job's expression
 * comes from platformConfig (with the job's defaultCronExpression as
 * fallback) so admins can tune cadence without a redeploy. The runner
 * already does the lock + record + timeout dance — this file only wires
 * the cron tick to runner.runOnce(job).
 *
 * SCHEDULER_ENABLED=false skips boot. Tests rely on this so they don't
 * accidentally fire jobs against the test DB.
 */
export async function startScheduler(): Promise<{ started: boolean; jobs: number }> {
  if (process.env.SCHEDULER_ENABLED === 'false') {
    return { started: false, jobs: 0 };
  }
  if (started) return { started: true, jobs: scheduledTasks.length };

  const lockRepo = new JobLockRepository();
  const runRepo = new JobRunRepository();
  const runner = new SchedulerRunner(lockRepo, runRepo);

  for (const job of jobRegistry) {
    const expression = await resolveCronExpression(job, getConfigString);
    if (!cron.validate(expression)) {
      console.error(`[scheduler] invalid cron expression for ${job.name}: ${expression}`);
      continue;
    }
    const task = cron.schedule(expression, async () => {
      try {
        await runner.runOnce(job);
      } catch (err) {
        console.error(`[scheduler] ${job.name} runOnce errored at the wrapper layer:`, err);
      }
    });
    scheduledTasks.push({ jobName: job.name, task });
    console.log(`[scheduler] ${job.name} scheduled at "${expression}"`);
  }

  started = true;
  return { started: true, jobs: scheduledTasks.length };
}

/** Test/shutdown helper: stops every cron task and resets state. */
export function stopScheduler(): void {
  for (const { task } of scheduledTasks) task.stop();
  scheduledTasks.length = 0;
  started = false;
}

/**
 * Build a runner + service surface without scheduling cron tasks. Used by
 * the admin router to expose triggerJob / status / recent-runs without
 * forcing the cron engine to be running.
 */
export function buildSchedulerSurface(): {
  registry: JobDefinition[];
  runner: SchedulerRunner;
  lockRepo: JobLockRepository;
  runRepo: JobRunRepository;
} {
  const lockRepo = new JobLockRepository();
  const runRepo = new JobRunRepository();
  const runner = new SchedulerRunner(lockRepo, runRepo);
  return { registry: jobRegistry, runner, lockRepo, runRepo };
}
