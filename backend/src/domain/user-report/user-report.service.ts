import { transaction, query } from '../../db.js';
import type { CustomClient } from '../../db.js';
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
  isPgError,
} from '../../shared/errors/index.js';
import type {
  UserReport,
  UserReportReasonCode,
  UserReportStatus,
} from './user-report.entity.js';
import type {
  IUserReportRepository,
  ListUserReportsFilter,
} from './user-report.interface.js';
import type { NotificationService } from '../notification/notification.service.js';
import type { AuditLogService } from '../audit/audit.service.js';

export interface FileReportInput {
  reportedUserId: string;
  reasonCode: UserReportReasonCode;
  description?: string;
  matchId?: string;
  evidenceUrls?: string[];
}

export interface ResolveReportInput {
  outcome: 'upheld' | 'dismissed';
  resolution: string;
  resolutionNotes?: string;
  actionTakenOnReported?: string;
}

/**
 * User reports flow: file → admin review → resolve. The unique partial index
 * on (reporter, reported) WHERE status IN active states blocks pile-on at
 * the SQL layer; the service catches the violation and re-throws the
 * cleaner DUPLICATE_OPEN_REPORT error.
 *
 * Privacy: getReportsAgainstMe strips reporterUserId from each row so the
 * reported user can see they were reported but not by whom. Admins see
 * everything via list().
 */
export class UserReportService {
  constructor(
    private readonly repo: IUserReportRepository,
    private readonly notificationService: NotificationService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async fileReport(input: FileReportInput, byUserId: string): Promise<UserReport> {
    if (input.reportedUserId === byUserId) {
      throw new ValidationError('CANNOT_REPORT_SELF');
    }
    // Verify reported user exists.
    const [reportedExists] = await query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM "user" WHERE id = :id) AS exists`,
      { id: input.reportedUserId },
    );
    if (!reportedExists?.exists) throw new NotFoundError('User');

    if (input.matchId) {
      // Reporter must have been a participant in the match.
      const [participated] = await query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM "matchParticipants" mp
           LEFT JOIN teams t ON t.id = mp."teamId"
           WHERE mp."matchId" = :matchId
             AND (
               mp."userId" = :userId
               OR t."captainId" = :userId
               OR EXISTS (
                 SELECT 1 FROM "teamMembers" tm
                 WHERE tm."teamId" = mp."teamId"
                   AND tm."userId" = :userId
                   AND tm."releasedAt" IS NULL
               )
             )
         ) AS exists`,
        { matchId: input.matchId, userId: byUserId },
      );
      if (!participated?.exists) {
        throw new AuthorizationError('REPORTER_NOT_MATCH_PARTICIPANT');
      }
    }

    return await transaction(async (client) => {
      let report: UserReport;
      try {
        report = await this.repo.create({
          reporterUserId: byUserId,
          reportedUserId: input.reportedUserId,
          matchId: input.matchId ?? null,
          reasonCode: input.reasonCode,
          description: input.description ?? null,
          evidenceUrls: input.evidenceUrls ?? [],
        }, client);
      } catch (err: unknown) {
        if (isPgError(err) && err.code === '23505') {
          // Hit the partial unique index on (reporter, reported) WHERE active.
          throw new ConflictError('DUPLICATE_OPEN_REPORT');
        }
        throw err;
      }

      await this.notifyAdmins('user_report_filed', {
        reportId: report.id,
        reportedUserId: report.reportedUserId,
        reasonCode: report.reasonCode,
      }, client);

      return report;
    });
  }

  async getMyFiledReports(byUserId: string, limit = 50): Promise<UserReport[]> {
    return this.repo.findManyByReporter(byUserId, limit);
  }

  /**
   * Returns reports filed against the caller WITH reporterUserId stripped.
   * The reported user shouldn't be able to identify who filed.
   */
  async getReportsAgainstMe(byUserId: string, limit = 50): Promise<Array<Omit<UserReport, 'reporterUserId'>>> {
    const rows = await this.repo.findManyAgainstReported(byUserId, limit);
    return rows.map((r) => {
      const { reporterUserId: _stripped, ...rest } = r;
      return rest;
    });
  }

  // ─── admin ────────────────────────────────────────────────────────────────

  async listForAdmin(
    byAdminUserId: string,
    filter: { status?: UserReportStatus; reportedUserId?: string; reporterUserId?: string; limit?: number },
  ): Promise<UserReport[]> {
    await this.assertAdmin(byAdminUserId);
    const f: ListUserReportsFilter = { limit: filter.limit ?? 50 };
    if (filter.status) f.status = filter.status;
    if (filter.reportedUserId) f.reportedUserId = filter.reportedUserId;
    if (filter.reporterUserId) f.reporterUserId = filter.reporterUserId;
    return this.repo.list(f);
  }

  async getByIdForAdmin(reportId: string, byAdminUserId: string): Promise<UserReport> {
    await this.assertAdmin(byAdminUserId);
    const r = await this.repo.findById(reportId);
    if (!r) throw new NotFoundError('UserReport');
    return r;
  }

  async setUnderReview(reportId: string, byAdminUserId: string): Promise<UserReport> {
    await this.assertAdmin(byAdminUserId);
    return await transaction(async (client) => {
      const before = await this.repo.findById(reportId);
      if (!before) throw new NotFoundError('UserReport');
      const after = await this.repo.setUnderReview(reportId, byAdminUserId, client);
      await this.auditLogService.recordAdminAction({
        adminUserId: byAdminUserId,
        action: 'user_report.set_under_review',
        resource: 'user_report',
        resourceId: reportId,
        beforeState: before,
        afterState: after,
      });
      return after;
    });
  }

  async resolveReport(
    reportId: string,
    input: ResolveReportInput,
    byAdminUserId: string,
  ): Promise<UserReport> {
    await this.assertAdmin(byAdminUserId);
    return await transaction(async (client) => {
      const before = await this.repo.findById(reportId);
      if (!before) throw new NotFoundError('UserReport');
      const after = await this.repo.resolve(reportId, {
        outcome: input.outcome,
        resolution: input.resolution,
        resolutionNotes: input.resolutionNotes ?? null,
        actionTakenOnReported: input.actionTakenOnReported ?? null,
        resolvedByUserId: byAdminUserId,
      }, client);

      // Notify reporter.
      await this.notificationService.enqueue({
        userId: after.reporterUserId,
        type: 'user_report_resolved',
        payload: {
          reportId, outcome: input.outcome, resolution: input.resolution,
        },
      }, client);
      // Notify reported only on uphold (with action) — dismissed reports
      // shouldn't surface to the reported user.
      if (input.outcome === 'upheld') {
        await this.notificationService.enqueue({
          userId: after.reportedUserId,
          type: 'user_report_action_taken',
          payload: {
            reportId,
            action: input.actionTakenOnReported ?? 'no_action',
          },
        }, client);
      }

      await this.auditLogService.recordAdminAction({
        adminUserId: byAdminUserId,
        action: `user_report.${input.outcome}`,
        resource: 'user_report',
        resourceId: reportId,
        beforeState: before,
        afterState: after,
        notes: input.resolutionNotes,
      });
      return after;
    });
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

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

  private async notifyAdmins(
    type: string,
    payload: Record<string, unknown>,
    client: CustomClient,
  ): Promise<void> {
    const admins = await query<{ id: string }>(
      `SELECT u.id FROM "user" u
       JOIN "userRole" ur ON ur."userId" = u.id
       JOIN role r ON r.id = ur."roleId"
       WHERE r.name = 'admin'`,
    );
    for (const a of admins) {
      await this.notificationService.enqueue({ userId: a.id, type, payload }, client);
    }
  }
}
