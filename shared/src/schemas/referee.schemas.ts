import { z } from 'zod';
import { MatchSideSchema } from './match.schemas';

// ─── enums ──────────────────────────────────────────────────────────────────

export const RefereeAssignmentRoleSchema = z.enum(['main', 'assistant']);
export type RefereeAssignmentRole = z.infer<typeof RefereeAssignmentRoleSchema>;

export const RefereeAssignmentStatusSchema = z.enum([
  'assigned',
  'accepted',
  'declined',
  'checked_in',
  'no_show',
  'promoted',
  'completed',
  'cancelled',
]);
export type RefereeAssignmentStatus = z.infer<typeof RefereeAssignmentStatusSchema>;

export const RefereeFlagReasonSchema = z.enum([
  'bias_toward_opponent',
  'incorrect_calls',
  'aggressive_behavior',
  'inattention',
  'other',
]);
export type RefereeFlagReason = z.infer<typeof RefereeFlagReasonSchema>;

export const RefereeFlagStatusSchema = z.enum(['open', 'reviewed', 'upheld', 'dismissed']);
export type RefereeFlagStatus = z.infer<typeof RefereeFlagStatusSchema>;

// ─── entities ───────────────────────────────────────────────────────────────

export const RefereeProfileSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  reliabilityScore: z.number().min(0).max(5),
  totalMatchesOfficiated: z.number().int().min(0),
  totalNoShows: z.number().int().min(0),
  totalCaptainFlags: z.number().int().min(0),
  baseCity: z.string().nullable(),
  isAcceptingAssignments: z.boolean(),
  lastOfficiatedAt: z.coerce.date().nullable(),
  bio: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type RefereeProfile = z.infer<typeof RefereeProfileSchema>;

export const RefereeCertificationSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  gameId: z.string().uuid(),
  certifiedAt: z.coerce.date(),
  certifiedByUserId: z.string().uuid(),
  revokedAt: z.coerce.date().nullable(),
  revokedByUserId: z.string().uuid().nullable(),
  revocationReason: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type RefereeCertification = z.infer<typeof RefereeCertificationSchema>;

export const RefereeConflictSchema = z.object({
  id: z.string().uuid(),
  refereeUserId: z.string().uuid(),
  conflictedTeamId: z.string().uuid().nullable(),
  conflictedUserId: z.string().uuid().nullable(),
  reason: z.string().nullable(),
  declaredAt: z.coerce.date(),
  removedAt: z.coerce.date().nullable(),
});
export type RefereeConflict = z.infer<typeof RefereeConflictSchema>;

export const RefereeAssignmentSchema = z.object({
  id: z.string().uuid(),
  matchId: z.string().uuid(),
  refereeUserId: z.string().uuid(),
  role: RefereeAssignmentRoleSchema,
  status: RefereeAssignmentStatusSchema,
  assignedByUserId: z.string().uuid(),
  assignedAt: z.coerce.date(),
  respondedAt: z.coerce.date().nullable(),
  checkedInAt: z.coerce.date().nullable(),
  promotedAt: z.coerce.date().nullable(),
  promotedFromAssignmentId: z.string().uuid().nullable(),
  declineReason: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type RefereeAssignment = z.infer<typeof RefereeAssignmentSchema>;

export const RefereeCaptainFlagSchema = z.object({
  id: z.string().uuid(),
  matchId: z.string().uuid(),
  refereeUserId: z.string().uuid(),
  flaggedByUserId: z.string().uuid(),
  flaggedBySide: MatchSideSchema,
  reason: RefereeFlagReasonSchema,
  description: z.string().nullable(),
  status: RefereeFlagStatusSchema,
  reviewedByUserId: z.string().uuid().nullable(),
  reviewedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
});
export type RefereeCaptainFlag = z.infer<typeof RefereeCaptainFlagSchema>;

// ─── inputs ─────────────────────────────────────────────────────────────────

export const UpdateRefereeProfileInputSchema = z.object({
  bio: z.string().max(2000).optional(),
  baseCity: z.string().max(100).optional(),
  isAcceptingAssignments: z.boolean().optional(),
});
export type UpdateRefereeProfileInput = z.infer<typeof UpdateRefereeProfileInputSchema>;

export const DeclareConflictInputSchema = z.object({
  conflictedTeamId: z.string().uuid().optional(),
  conflictedUserId: z.string().uuid().optional(),
  reason: z.string().max(500).optional(),
}).refine(
  (v) => Boolean(v.conflictedTeamId) !== Boolean(v.conflictedUserId),
  { message: 'Provide exactly one of conflictedTeamId or conflictedUserId' },
);
export type DeclareConflictInput = z.infer<typeof DeclareConflictInputSchema>;

export const RemoveConflictInputSchema = z.object({
  conflictId: z.string().uuid(),
});
export type RemoveConflictInput = z.infer<typeof RemoveConflictInputSchema>;

export const AssignRefereeInputSchema = z.object({
  matchId: z.string().uuid(),
  refereeUserId: z.string().uuid(),
  role: RefereeAssignmentRoleSchema,
});
export type AssignRefereeInput = z.infer<typeof AssignRefereeInputSchema>;

export const RespondToAssignmentInputSchema = z.object({
  assignmentId: z.string().uuid(),
  accept: z.boolean(),
  declineReason: z.string().max(500).optional(),
});
export type RespondToAssignmentInput = z.infer<typeof RespondToAssignmentInputSchema>;

export const CheckInInputSchema = z.object({
  assignmentId: z.string().uuid(),
});
export type CheckInInput = z.infer<typeof CheckInInputSchema>;

export const StartRefereedMatchInputSchema = z.object({
  matchId: z.string().uuid(),
});
export type StartRefereedMatchInput = z.infer<typeof StartRefereedMatchInputSchema>;

export const RefereedStatInputSchema = z.object({
  side: MatchSideSchema,
  statKey: z.string().min(1).max(50),
  statValue: z.unknown(),
  minute: z.number().int().min(0).max(500).nullable().optional(),
  playerId: z.string().uuid().nullable().optional(),
});
export type RefereedStatInput = z.infer<typeof RefereedStatInputSchema>;

export const SubmitRefereedResultInputSchema = z.object({
  matchId: z.string().uuid(),
  scoreA: z.number().int().min(0),
  scoreB: z.number().int().min(0),
  stats: z.array(RefereedStatInputSchema).default([]),
});
export type SubmitRefereedResultInput = z.infer<typeof SubmitRefereedResultInputSchema>;

export const ReclaimMainSlotInputSchema = z.object({
  assignmentId: z.string().uuid(),
});
export type ReclaimMainSlotInput = z.infer<typeof ReclaimMainSlotInputSchema>;

export const FlagRefereeInputSchema = z.object({
  matchId: z.string().uuid(),
  refereeUserId: z.string().uuid(),
  reason: RefereeFlagReasonSchema,
  description: z.string().max(2000).optional(),
});
export type FlagRefereeInput = z.infer<typeof FlagRefereeInputSchema>;

export const CertifyRefereeInputSchema = z.object({
  userId: z.string().uuid(),
  gameId: z.string().uuid(),
  notes: z.string().max(2000).optional(),
});
export type CertifyRefereeInput = z.infer<typeof CertifyRefereeInputSchema>;

export const RevokeCertificationInputSchema = z.object({
  userId: z.string().uuid(),
  gameId: z.string().uuid(),
  reason: z.string().max(2000),
});
export type RevokeCertificationInput = z.infer<typeof RevokeCertificationInputSchema>;

export const TriggerCheckInWindowInputSchema = z.object({
  matchId: z.string().uuid(),
});
export type TriggerCheckInWindowInput = z.infer<typeof TriggerCheckInWindowInputSchema>;

export const TriggerAutoPromotionInputSchema = z.object({
  matchId: z.string().uuid(),
});
export type TriggerAutoPromotionInput = z.infer<typeof TriggerAutoPromotionInputSchema>;
