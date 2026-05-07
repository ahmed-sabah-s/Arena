import { z } from 'zod';
import { MatchModeForCreationSchema, MatchStakesSchema } from './match.schemas';

export const MatchInviteStatusSchema = z.enum(['open', 'claimed', 'expired', 'cancelled']);
export type MatchInviteStatus = z.infer<typeof MatchInviteStatusSchema>;

export const MatchInviteSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  qrPayload: z.string(),
  createdByUserId: z.string().uuid(),
  creatorTeamId: z.string().uuid().nullable(),
  gameId: z.string().uuid(),
  formatId: z.string().uuid(),
  divisionId: z.string().uuid().nullable(),
  stakes: MatchStakesSchema,
  matchMode: MatchModeForCreationSchema,
  venueId: z.string().uuid().nullable(),
  status: MatchInviteStatusSchema,
  claimedByUserId: z.string().uuid().nullable(),
  claimedByTeamId: z.string().uuid().nullable(),
  claimedAt: z.coerce.date().nullable(),
  matchId: z.string().uuid().nullable(),
  creatorConfirmedAt: z.coerce.date().nullable(),
  expiresAt: z.coerce.date(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type MatchInvite = z.infer<typeof MatchInviteSchema>;

export const CreateMatchInviteInputSchema = z.object({
  gameId: z.string().uuid(),
  formatId: z.string().uuid(),
  divisionId: z.string().uuid().optional(),
  creatorTeamId: z.string().uuid().optional(),
  stakes: MatchStakesSchema.default('friendly'),
  matchMode: MatchModeForCreationSchema.default('score_only'),
  venueId: z.string().uuid().optional(),
});
export type CreateMatchInviteInput = z.infer<typeof CreateMatchInviteInputSchema>;

// Either a code or a QR payload accepted; service handles both.
export const PreviewMatchInviteInputSchema = z.object({
  code: z.string().optional(),
  qrPayload: z.string().optional(),
}).refine((v) => Boolean(v.code) || Boolean(v.qrPayload), {
  message: 'Provide either code or qrPayload',
});
export type PreviewMatchInviteInput = z.infer<typeof PreviewMatchInviteInputSchema>;

export const ClaimMatchInviteInputSchema = z.object({
  code: z.string().optional(),
  qrPayload: z.string().optional(),
  // For team-based games, the claiming side identifies their team.
  claimingTeamId: z.string().uuid().optional(),
}).refine((v) => Boolean(v.code) || Boolean(v.qrPayload), {
  message: 'Provide either code or qrPayload',
});
export type ClaimMatchInviteInput = z.infer<typeof ClaimMatchInviteInputSchema>;

export const ConfirmClaimInputSchema = z.object({
  inviteId: z.string().uuid(),
});
export type ConfirmClaimInput = z.infer<typeof ConfirmClaimInputSchema>;

export const CancelMatchInviteInputSchema = z.object({
  inviteId: z.string().uuid(),
});
export type CancelMatchInviteInput = z.infer<typeof CancelMatchInviteInputSchema>;
