import pg from 'pg';
import { query } from '../../db.js';
import type { CustomClient } from '../../db.js';
import { AppError, NotFoundError } from '../../shared/errors/index.js';
import type { UserReport } from './user-report.entity.js';
import type {
  CreateUserReportData,
  IUserReportRepository,
  ListUserReportsFilter,
  ResolveUserReportData,
} from './user-report.interface.js';

async function exec<T extends pg.QueryResultRow>(
  client: CustomClient | undefined,
  sql: string,
  params: Record<string, unknown>,
): Promise<T[]> {
  if (client) {
    const res = await client.query<T>(sql, params);
    return res.rows;
  }
  return query<T>(sql, params);
}

// pg returns JSONB as already-parsed JS values; the evidenceUrls column is
// always an array, so the row type matches the entity directly.
type UserReportRow = UserReport;

export class UserReportRepository implements IUserReportRepository {
  async create(input: CreateUserReportData, client?: CustomClient): Promise<UserReport> {
    const rows = await exec<UserReportRow>(
      client,
      `INSERT INTO "userReports" (
         "reporterUserId", "reportedUserId", "matchId",
         "reasonCode", description, "evidenceUrls"
       )
       VALUES (
         :reporterUserId, :reportedUserId, :matchId,
         :reasonCode, :description, :evidenceUrls
       )
       RETURNING *`,
      {
        reporterUserId: input.reporterUserId,
        reportedUserId: input.reportedUserId,
        matchId: input.matchId,
        reasonCode: input.reasonCode,
        description: input.description,
        evidenceUrls: JSON.stringify(input.evidenceUrls ?? []),
      },
    );
    if (!rows[0]) throw new AppError('Failed to create user report', 500);
    return rows[0];
  }

  async findById(id: string): Promise<UserReport | null> {
    const [row] = await query<UserReportRow>(
      `SELECT * FROM "userReports" WHERE id = :id`,
      { id },
    );
    return row ?? null;
  }

  async findManyByReporter(reporterUserId: string, limit: number): Promise<UserReport[]> {
    return query<UserReportRow>(
      `SELECT * FROM "userReports"
       WHERE "reporterUserId" = :reporterUserId
       ORDER BY "createdAt" DESC
       LIMIT :limit`,
      { reporterUserId, limit },
    );
  }

  async findManyAgainstReported(reportedUserId: string, limit: number): Promise<UserReport[]> {
    return query<UserReportRow>(
      `SELECT * FROM "userReports"
       WHERE "reportedUserId" = :reportedUserId
       ORDER BY "createdAt" DESC
       LIMIT :limit`,
      { reportedUserId, limit },
    );
  }

  async list(filter: ListUserReportsFilter): Promise<UserReport[]> {
    const conditions: string[] = [];
    const params: Record<string, unknown> = { limit: filter.limit };
    if (filter.status) {
      conditions.push(`status = :status`);
      params.status = filter.status;
    }
    if (filter.reportedUserId) {
      conditions.push(`"reportedUserId" = :reportedUserId`);
      params.reportedUserId = filter.reportedUserId;
    }
    if (filter.reporterUserId) {
      conditions.push(`"reporterUserId" = :reporterUserId`);
      params.reporterUserId = filter.reporterUserId;
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    return query<UserReportRow>(
      `SELECT * FROM "userReports" ${where}
       ORDER BY "createdAt" DESC
       LIMIT :limit`,
      params,
    );
  }

  async setUnderReview(
    id: string,
    byUserId: string,
    client?: CustomClient,
  ): Promise<UserReport> {
    const rows = await exec<UserReportRow>(
      client,
      `UPDATE "userReports"
       SET status = 'under_review', "resolvedByUserId" = :byUserId
       WHERE id = :id AND status = 'open'
       RETURNING *`,
      { id, byUserId },
    );
    if (!rows[0]) throw new NotFoundError('UserReport');
    return rows[0];
  }

  async resolve(
    id: string,
    input: ResolveUserReportData,
    client?: CustomClient,
  ): Promise<UserReport> {
    const rows = await exec<UserReportRow>(
      client,
      `UPDATE "userReports"
       SET status = :status,
           resolution = :resolution,
           "resolutionNotes" = :resolutionNotes,
           "actionTakenOnReported" = :actionTakenOnReported,
           "resolvedByUserId" = :resolvedByUserId,
           "resolvedAt" = CURRENT_TIMESTAMP
       WHERE id = :id AND status IN ('open', 'under_review')
       RETURNING *`,
      {
        id,
        status: input.outcome,
        resolution: input.resolution,
        resolutionNotes: input.resolutionNotes,
        actionTakenOnReported: input.actionTakenOnReported,
        resolvedByUserId: input.resolvedByUserId,
      },
    );
    if (!rows[0]) throw new NotFoundError('UserReport');
    return rows[0];
  }
}
