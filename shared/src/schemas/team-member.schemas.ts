import { z } from 'zod';

export const TeamMemberReleaseReasonSchema = z.enum([
  'left',
  'released_by_captain',
  'team_disbanded',
  'admin_action',
]);
export type TeamMemberReleaseReason = z.infer<typeof TeamMemberReleaseReasonSchema>;

export const TeamInviteStatusSchema = z.enum([
  'pending',
  'accepted',
  'declined',
  'expired',
  'cancelled',
]);
export type TeamInviteStatus = z.infer<typeof TeamInviteStatusSchema>;

const ShirtNumberSchema = z.number().int().min(1).max(99);
const PositionSchema = z.string().max(50);

export const TeamMemberSchema = z.object({
  id: z.string().uuid(),
  teamId: z.string().uuid(),
  userId: z.string().uuid(),
  gameId: z.string().uuid(),
  formatId: z.string().uuid(),
  divisionId: z.string().uuid().nullable(),
  isCaptain: z.boolean(),
  position: PositionSchema.nullable(),
  shirtNumber: ShirtNumberSchema.nullable(),
  joinedAt: z.coerce.date(),
  releasedAt: z.coerce.date().nullable(),
  releaseReason: TeamMemberReleaseReasonSchema.nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type TeamMember = z.infer<typeof TeamMemberSchema>;

export const TeamInviteSchema = z.object({
  id: z.string().uuid(),
  teamId: z.string().uuid(),
  invitedUserId: z.string().uuid(),
  invitedByUserId: z.string().uuid(),
  position: PositionSchema.nullable(),
  shirtNumber: ShirtNumberSchema.nullable(),
  status: TeamInviteStatusSchema,
  message: z.string().nullable(),
  createdAt: z.coerce.date(),
  respondedAt: z.coerce.date().nullable(),
  expiresAt: z.coerce.date(),
});
export type TeamInvite = z.infer<typeof TeamInviteSchema>;

export const InviteTeamMemberInputSchema = z.object({
  teamId: z.string().uuid(),
  userId: z.string().uuid(),
  position: PositionSchema.optional(),
  shirtNumber: ShirtNumberSchema.optional(),
  message: z.string().max(500).optional(),
});
export type InviteTeamMemberInput = z.infer<typeof InviteTeamMemberInputSchema>;

export const AcceptInviteInputSchema = z.object({
  inviteId: z.string().uuid(),
});
export type AcceptInviteInput = z.infer<typeof AcceptInviteInputSchema>;

export const DeclineInviteInputSchema = z.object({
  inviteId: z.string().uuid(),
});
export type DeclineInviteInput = z.infer<typeof DeclineInviteInputSchema>;

export const CancelInviteInputSchema = z.object({
  inviteId: z.string().uuid(),
});
export type CancelInviteInput = z.infer<typeof CancelInviteInputSchema>;

export const ReleaseMemberInputSchema = z.object({
  teamId: z.string().uuid(),
  userId: z.string().uuid(),
  reason: z.string().max(500).optional(),
});
export type ReleaseMemberInput = z.infer<typeof ReleaseMemberInputSchema>;

export const LeaveTeamInputSchema = z.object({
  teamId: z.string().uuid(),
});
export type LeaveTeamInput = z.infer<typeof LeaveTeamInputSchema>;

export const UpdateMemberInputSchema = z.object({
  teamId: z.string().uuid(),
  userId: z.string().uuid(),
  position: PositionSchema.optional(),
  shirtNumber: ShirtNumberSchema.optional(),
});
export type UpdateMemberInput = z.infer<typeof UpdateMemberInputSchema>;
