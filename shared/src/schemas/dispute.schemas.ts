import { z } from 'zod';
import { MatchSideSchema } from './match.schemas';

export const DisputeStatusSchema = z.enum(['open', 'resolved', 'dismissed']);
export type DisputeStatus = z.infer<typeof DisputeStatusSchema>;

export const DisputeSchema = z.object({
  id: z.string().uuid(),
  matchId: z.string().uuid(),
  openedByUserId: z.string().uuid(),
  openedBySide: MatchSideSchema,
  reason: z.string(),
  claimedScoreA: z.number().int().nullable(),
  claimedScoreB: z.number().int().nullable(),
  status: DisputeStatusSchema,
  resolution: z.string().nullable(),
  resolvedByUserId: z.string().uuid().nullable(),
  resolvedAt: z.coerce.date().nullable(),
  resolutionNotes: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Dispute = z.infer<typeof DisputeSchema>;

// ─── Phase 8 resolution flow ────────────────────────────────────────────────

export const DisputeResolutionSchema = z.enum([
  'side_a_result_stands',
  'side_b_result_stands',
  'match_voided',
  'match_replay_required',
  'admin_decided_score',
]);
export type DisputeResolution = z.infer<typeof DisputeResolutionSchema>;

export const ResolveDisputeInputSchema = z.object({
  disputeId: z.string().uuid(),
  resolution: DisputeResolutionSchema,
  notes: z.string().max(2000).optional(),
  // Required only when resolution === 'admin_decided_score'.
  scoreA: z.number().int().nonnegative().optional(),
  scoreB: z.number().int().nonnegative().optional(),
}).refine(
  (v) => v.resolution !== 'admin_decided_score' || (v.scoreA != null && v.scoreB != null),
  { message: 'admin_decided_score resolution requires scoreA and scoreB' },
);
export type ResolveDisputeInput = z.infer<typeof ResolveDisputeInputSchema>;

export const DismissDisputeInputSchema = z.object({
  disputeId: z.string().uuid(),
  notes: z.string().max(2000),
});
export type DismissDisputeInput = z.infer<typeof DismissDisputeInputSchema>;

export const GetDisputeByIdInputSchema = z.object({
  disputeId: z.string().uuid(),
});
export type GetDisputeByIdInput = z.infer<typeof GetDisputeByIdInputSchema>;
