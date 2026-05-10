export type UserReportReasonCode =
  | 'cheating'
  | 'abuse'
  | 'no_show'
  | 'fake_identity'
  | 'inappropriate_behavior'
  | 'collusion'
  | 'other';

export type UserReportStatus =
  | 'open'
  | 'under_review'
  | 'upheld'
  | 'dismissed'
  | 'auto_dismissed';

export interface UserReport {
  id: string;
  reporterUserId: string;
  reportedUserId: string;
  matchId: string | null;
  reasonCode: UserReportReasonCode;
  description: string | null;
  evidenceUrls: string[];
  status: UserReportStatus;
  resolution: string | null;
  resolutionNotes: string | null;
  resolvedByUserId: string | null;
  resolvedAt: Date | null;
  actionTakenOnReported: string | null;
  createdAt: Date;
  updatedAt: Date;
}
