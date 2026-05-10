import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db.js', () => ({
  query: vi.fn(async () => []),
  transaction: vi.fn(),
}));

import { SchedulerRunner, type JobDefinition } from './scheduler.runner.js';
import type { IJobLockRepository, IJobRunRepository } from './scheduler.interface.js';

function makeJob(handler: JobDefinition['handler'], lockTtlSeconds = 30): JobDefinition {
  return {
    name: 'test-job',
    cronConfigKey: 'cron_test',
    defaultCronExpression: '*/5 * * * *',
    lockTtlSeconds,
    description: 'unit-test job',
    handler,
  };
}

function makeRepos() {
  const lockRepo: IJobLockRepository = {
    tryAcquire: vi.fn(async () => ({ acquired: true, lockedBy: 'me' })),
    release: vi.fn(async () => undefined),
    recordRunResult: vi.fn(async () => undefined),
    findByName: vi.fn(),
  };
  const runRepo: IJobRunRepository = {
    start: vi.fn(async () => 'run-1'),
    complete: vi.fn(async () => undefined),
    findRecent: vi.fn(),
  };
  return { lockRepo, runRepo };
}

beforeEach(() => vi.clearAllMocks());

describe('SchedulerRunner.runOnce', () => {
  it('returns acquired=false when the lock is held elsewhere', async () => {
    const { lockRepo, runRepo } = makeRepos();
    vi.mocked(lockRepo.tryAcquire).mockResolvedValueOnce({ acquired: false });
    const runner = new SchedulerRunner(lockRepo, runRepo);
    const out = await runner.runOnce(makeJob(async () => ({ itemsProcessed: 0 })));
    expect(out.acquired).toBe(false);
    expect(runRepo.start).not.toHaveBeenCalled();
  });

  it('records success on a clean handler return', async () => {
    const { lockRepo, runRepo } = makeRepos();
    const runner = new SchedulerRunner(lockRepo, runRepo);
    const out = await runner.runOnce(makeJob(async () => ({ itemsProcessed: 7 })));
    expect(out.acquired).toBe(true);
    expect(out.status).toBe('success');
    expect(out.result?.itemsProcessed).toBe(7);
    expect(runRepo.complete).toHaveBeenCalledWith(
      'run-1', expect.any(Date), 'success', expect.any(Number), { itemsProcessed: 7 }, null,
    );
    expect(lockRepo.release).toHaveBeenCalled();
  });

  it('records failure when the handler throws', async () => {
    const { lockRepo, runRepo } = makeRepos();
    const runner = new SchedulerRunner(lockRepo, runRepo);
    const out = await runner.runOnce(makeJob(async () => { throw new Error('boom'); }));
    expect(out.status).toBe('failure');
    expect(out.error).toBe('boom');
    expect(runRepo.complete).toHaveBeenCalledWith(
      'run-1', expect.any(Date), 'failure', expect.any(Number), null, 'boom',
    );
    // Lock still released so the next firing can try.
    expect(lockRepo.release).toHaveBeenCalled();
  });

  it('records timeout when handler exceeds lockTtlSeconds', async () => {
    const { lockRepo, runRepo } = makeRepos();
    const runner = new SchedulerRunner(lockRepo, runRepo);
    // 0.05 second TTL so the test runs quickly.
    const job = {
      ...makeJob(async () => new Promise<{ itemsProcessed: number }>(() => undefined), 0.05),
    };
    const out = await runner.runOnce(job);
    expect(out.status).toBe('timeout');
    expect(runRepo.complete).toHaveBeenCalledWith(
      'run-1', expect.any(Date), 'timeout', expect.any(Number), null, expect.stringContaining('timed out'),
    );
  });
});
