import type { CustomClient } from '../../db.js';
import type {
  UserReport,
  UserReportReasonCode,
  UserReportStatus,
} from './user-report.entity.js';

export interface CreateUserReportData {
  reporterUserId: string;
  reportedUserId: string;
  matchId: string | null;
  reasonCode: UserReportReasonCode;
  description: string | null;
  evidenceUrls: string[];
}

export interface ResolveUserReportData {
  outcome: 'upheld' | 'dismissed';
  resolution: string;
  resolutionNotes: string | null;
  actionTakenOnReported: string | null;
  resolvedByUserId: string;
}

export interface ListUserReportsFilter {
  status?: UserReportStatus;
  reportedUserId?: string;
  reporterUserId?: string;
  limit: number;
}

export interface IUserReportRepository {
  create(input: CreateUserReportData, client?: CustomClient): Promise<UserReport>;
  findById(id: string): Promise<UserReport | null>;
  findManyByReporter(reporterUserId: string, limit: number): Promise<UserReport[]>;
  findManyAgainstReported(reportedUserId: string, limit: number): Promise<UserReport[]>;
  list(filter: ListUserReportsFilter): Promise<UserReport[]>;
  setUnderReview(id: string, byUserId: string, client?: CustomClient): Promise<UserReport>;
  resolve(id: string, input: ResolveUserReportData, client?: CustomClient): Promise<UserReport>;
}
