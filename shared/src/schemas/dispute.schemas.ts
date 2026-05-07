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
