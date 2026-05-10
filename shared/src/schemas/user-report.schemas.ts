import { z } from 'zod';

export const UserReportReasonCodeSchema = z.enum([
  'cheating',
  'abuse',
  'no_show',
  'fake_identity',
  'inappropriate_behavior',
  'collusion',
  'other',
]);
export type UserReportReasonCode = z.infer<typeof UserReportReasonCodeSchema>;

export const UserReportStatusSchema = z.enum([
  'open',
  'under_review',
  'upheld',
  'dismissed',
  'auto_dismissed',
]);
export type UserReportStatus = z.infer<typeof UserReportStatusSchema>;

export const UserReportSchema = z.object({
  id: z.string().uuid(),
  reporterUserId: z.string().uuid(),
  reportedUserId: z.string().uuid(),
  matchId: z.string().uuid().nullable(),
  reasonCode: UserReportReasonCodeSchema,
  description: z.string().nullable(),
  evidenceUrls: z.array(z.string().url()),
  status: UserReportStatusSchema,
  resolution: z.string().nullable(),
  resolutionNotes: z.string().nullable(),
  resolvedByUserId: z.string().uuid().nullable(),
  resolvedAt: z.coerce.date().nullable(),
  actionTakenOnReported: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type UserReport = z.infer<typeof UserReportSchema>;

/**
 * Privacy-stripped variant returned by getAgainstMe — the reported user
 * doesn't get to see who filed the report.
 */
export const UserReportWithoutReporterSchema = UserReportSchema.omit({
  reporterUserId: true,
});
export type UserReportWithoutReporter = z.infer<typeof UserReportWithoutReporterSchema>;

// ─── inputs ─────────────────────────────────────────────────────────────────

export const FileUserReportInputSchema = z.object({
  reportedUserId: z.string().uuid(),
  reasonCode: UserReportReasonCodeSchema,
  description: z.string().max(5000).optional(),
  matchId: z.string().uuid().optional(),
  evidenceUrls: z.array(z.string().url()).max(10).optional(),
});
export type FileUserReportInput = z.infer<typeof FileUserReportInputSchema>;

export const SetReportUnderReviewInputSchema = z.object({
  reportId: z.string().uuid(),
});
export type SetReportUnderReviewInput = z.infer<typeof SetReportUnderReviewInputSchema>;

export const ResolveUserReportInputSchema = z.object({
  reportId: z.string().uuid(),
  // Either uphold (with an action recorded) or dismiss.
  outcome: z.enum(['upheld', 'dismissed']),
  resolution: z.string().max(100),
  resolutionNotes: z.string().max(5000).optional(),
  actionTakenOnReported: z.string().max(50).optional(),
});
export type ResolveUserReportInput = z.infer<typeof ResolveUserReportInputSchema>;

export const ListUserReportsInputSchema = z.object({
  status: UserReportStatusSchema.optional(),
  reportedUserId: z.string().uuid().optional(),
  reporterUserId: z.string().uuid().optional(),
  limit: z.number().int().positive().max(200).default(50),
});
export type ListUserReportsInput = z.infer<typeof ListUserReportsInputSchema>;

export const GetUserReportByIdInputSchema = z.object({
  reportId: z.string().uuid(),
});
export type GetUserReportByIdInput = z.infer<typeof GetUserReportByIdInputSchema>;
