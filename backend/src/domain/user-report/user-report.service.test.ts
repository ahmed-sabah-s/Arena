import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db.js', () => ({
  transaction: vi.fn(async (cb: (client: unknown) => Promise<unknown>) =>
    cb({ query: vi.fn(async () => ({ rows: [] })) }),
  ),
  query: vi.fn(async () => []),
}));

import { transaction, query } from '../../db.js';
import { UserReportService } from './user-report.service.js';
import type { IUserReportRepository } from './user-report.interface.js';
import type { UserReport } from './user-report.entity.js';

const REPORTER = 'u-reporter';
const REPORTED = 'u-reported';
const ADMIN = 'u-admin';

function makeReport(overrides: Partial<UserReport> = {}): UserReport {
  return {
    id: 'r-1',
    reporterUserId: REPORTER,
    reportedUserId: REPORTED,
    matchId: null,
    reasonCode: 'no_show',
    description: null,
    evidenceUrls: [],
    status: 'open',
    resolution: null,
    resolutionNotes: null,
    resolvedByUserId: null,
    resolvedAt: null,
    actionTakenOnReported: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeRepo(): IUserReportRepository {
  return {
    create: vi.fn(async (input) => makeReport({
      reporterUserId: input.reporterUserId,
      reportedUserId: input.reportedUserId,
      matchId: input.matchId,
      reasonCode: input.reasonCode,
      description: input.description,
      evidenceUrls: input.evidenceUrls,
    })),
    findById: vi.fn(async () => makeReport()),
    findManyByReporter: vi.fn(async () => []),
    findManyAgainstReported: vi.fn(async () => []),
    list: vi.fn(async () => []),
    setUnderReview: vi.fn(async () => makeReport({ status: 'under_review' })),
    resolve: vi.fn(async () => makeReport({ status: 'upheld', resolution: 'evidence_substantiated' })),
  };
}

function makeServices() {
  const notificationService = { enqueue: vi.fn(async () => ({ id: 'n-1' })) } as unknown as
    import('../notification/notification.service.js').NotificationService;
  const auditLogService = { recordAdminAction: vi.fn(async () => undefined) } as unknown as
    import('../audit/audit.service.js').AuditLogService;
  return { notificationService, auditLogService };
}

function setQueryMock(opts: { admin?: Set<string>; userExists?: boolean; participated?: boolean } = {}): void {
  vi.mocked(query).mockImplementation(((...args: unknown[]) => {
    const sql = (args[0] ?? '') as string;
    const params = (args[1] ?? {}) as Record<string, unknown>;
    if (sql.includes("r.name = 'admin'")) {
      const id = params.userId as string | undefined;
      return Promise.resolve([{ exists: opts.admin?.has(id ?? '') ?? false }] as never);
    }
    if (sql.includes('FROM "user" WHERE id =')) {
      return Promise.resolve([{ exists: opts.userExists ?? true }] as never);
    }
    if (sql.includes('matchParticipants')) {
      return Promise.resolve([{ exists: opts.participated ?? true }] as never);
    }
    if (sql.includes('FROM "user" u')) {
      return Promise.resolve([{ id: ADMIN }] as never);
    }
    return Promise.resolve([] as never);
  }) as unknown as typeof query);
}

beforeEach(() => {
  vi.mocked(query).mockReset();
  vi.mocked(transaction).mockClear();
});

describe('UserReportService.fileReport', () => {
  it('happy path: inserts the report and notifies admins', async () => {
    setQueryMock();
    const repo = makeRepo();
    const { notificationService, auditLogService } = makeServices();
    const txClient = { query: vi.fn(async () => ({ rows: [] })) };
    vi.mocked(transaction).mockImplementationOnce(async (cb) =>
      cb(txClient as unknown as Parameters<typeof cb>[0]),
    );
    const svc = new UserReportService(repo, notificationService, auditLogService);
    const out = await svc.fileReport({
      reportedUserId: REPORTED, reasonCode: 'no_show', description: 'no show',
    }, REPORTER);
    expect(out.reporterUserId).toBe(REPORTER);
    expect(repo.create).toHaveBeenCalled();
  });

  it('rejects when reporter == reported', async () => {
    const repo = makeRepo();
    const { notificationService, auditLogService } = makeServices();
    const svc = new UserReportService(repo, notificationService, auditLogService);
    await expect(svc.fileReport({ reportedUserId: REPORTER, reasonCode: 'no_show' }, REPORTER))
      .rejects.toMatchObject({ message: expect.stringContaining('CANNOT_REPORT_SELF') });
  });

  it('rejects when reported user does not exist', async () => {
    setQueryMock({ userExists: false });
    const repo = makeRepo();
    const { notificationService, auditLogService } = makeServices();
    const svc = new UserReportService(repo, notificationService, auditLogService);
    await expect(svc.fileReport({ reportedUserId: REPORTED, reasonCode: 'no_show' }, REPORTER))
      .rejects.toMatchObject({ message: expect.stringContaining('User') });
  });

  it('rejects matchId-bound report when reporter did not participate', async () => {
    setQueryMock({ userExists: true, participated: false });
    const repo = makeRepo();
    const { notificationService, auditLogService } = makeServices();
    const svc = new UserReportService(repo, notificationService, auditLogService);
    await expect(svc.fileReport({
      reportedUserId: REPORTED, reasonCode: 'cheating', matchId: 'm-1',
    }, REPORTER)).rejects.toMatchObject({
      message: expect.stringContaining('REPORTER_NOT_MATCH_PARTICIPANT'),
    });
  });

  it('translates pg unique-violation to DUPLICATE_OPEN_REPORT', async () => {
    setQueryMock();
    const repo = makeRepo();
    vi.mocked(repo.create).mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));
    const { notificationService, auditLogService } = makeServices();
    const txClient = { query: vi.fn(async () => ({ rows: [] })) };
    vi.mocked(transaction).mockImplementationOnce(async (cb) =>
      cb(txClient as unknown as Parameters<typeof cb>[0]),
    );
    const svc = new UserReportService(repo, notificationService, auditLogService);
    await expect(svc.fileReport({ reportedUserId: REPORTED, reasonCode: 'no_show' }, REPORTER))
      .rejects.toMatchObject({ message: expect.stringContaining('DUPLICATE_OPEN_REPORT') });
  });
});

describe('UserReportService.getReportsAgainstMe', () => {
  it('strips reporterUserId from each row', async () => {
    setQueryMock();
    const repo = makeRepo();
    vi.mocked(repo.findManyAgainstReported).mockResolvedValue([
      makeReport({ id: 'r-1' }),
      makeReport({ id: 'r-2', reporterUserId: 'u-other' }),
    ]);
    const { notificationService, auditLogService } = makeServices();
    const svc = new UserReportService(repo, notificationService, auditLogService);
    const out = await svc.getReportsAgainstMe(REPORTED);
    expect(out).toHaveLength(2);
    for (const r of out) {
      expect((r as Record<string, unknown>).reporterUserId).toBeUndefined();
    }
  });
});

describe('UserReportService.resolveReport', () => {
  it('admin uphold notifies both reporter and reported', async () => {
    setQueryMock({ admin: new Set([ADMIN]) });
    const repo = makeRepo();
    const { notificationService, auditLogService } = makeServices();
    const txClient = { query: vi.fn(async () => ({ rows: [] })) };
    vi.mocked(transaction).mockImplementationOnce(async (cb) =>
      cb(txClient as unknown as Parameters<typeof cb>[0]),
    );
    const svc = new UserReportService(repo, notificationService, auditLogService);
    await svc.resolveReport('r-1', {
      outcome: 'upheld', resolution: 'evidence_substantiated',
      actionTakenOnReported: 'temporary_ban_7d',
    }, ADMIN);
    expect(notificationService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ userId: REPORTER, type: 'user_report_resolved' }),
      expect.anything(),
    );
    expect(notificationService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ userId: REPORTED, type: 'user_report_action_taken' }),
      expect.anything(),
    );
    expect(auditLogService.recordAdminAction).toHaveBeenCalled();
  });

  it('admin dismiss notifies only reporter', async () => {
    setQueryMock({ admin: new Set([ADMIN]) });
    const repo = makeRepo();
    vi.mocked(repo.resolve).mockResolvedValue(makeReport({ status: 'dismissed' }));
    const { notificationService, auditLogService } = makeServices();
    const txClient = { query: vi.fn(async () => ({ rows: [] })) };
    vi.mocked(transaction).mockImplementationOnce(async (cb) =>
      cb(txClient as unknown as Parameters<typeof cb>[0]),
    );
    const svc = new UserReportService(repo, notificationService, auditLogService);
    await svc.resolveReport('r-1', {
      outcome: 'dismissed', resolution: 'evidence_insufficient',
    }, ADMIN);
    const calls = vi.mocked(notificationService.enqueue).mock.calls;
    expect(calls.some((c) => (c[0] as { userId: string }).userId === REPORTER)).toBe(true);
    expect(calls.some((c) => (c[0] as { userId: string }).userId === REPORTED)).toBe(false);
  });

  it('rejects when caller is not admin', async () => {
    setQueryMock({ admin: new Set() });
    const repo = makeRepo();
    const { notificationService, auditLogService } = makeServices();
    const svc = new UserReportService(repo, notificationService, auditLogService);
    await expect(svc.resolveReport('r-1', {
      outcome: 'upheld', resolution: 'x',
    }, 'u-stranger')).rejects.toMatchObject({ message: expect.stringContaining('NOT_ADMIN') });
  });
});
