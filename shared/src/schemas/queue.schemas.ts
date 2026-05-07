import { z } from 'zod';

export const QueueStatusSchema = z.enum([
  'waiting',
  'matched',
  'cancelled',
  'expired',
  'friendly_offered',
]);
export type QueueStatus = z.infer<typeof QueueStatusSchema>;

export const QueueEntrySchema = z.object({
  id: z.string().uuid(),
  teamId: z.string().uuid().nullable(),
  userId: z.string().uuid().nullable(),
  gameId: z.string().uuid(),
  formatId: z.string().uuid(),
  divisionId: z.string().uuid().nullable(),
  mmrAtQueue: z.number().int(),
  status: QueueStatusSchema,
  matchedWithEntryId: z.string().uuid().nullable(),
  matchId: z.string().uuid().nullable(),
  preferredCity: z.string().nullable(),
  preferredVenueId: z.string().uuid().nullable(),
  queuedAt: z.coerce.date(),
  expiresAt: z.coerce.date().nullable(),
  matchedAt: z.coerce.date().nullable(),
});
export type QueueEntry = z.infer<typeof QueueEntrySchema>;

export const EnqueueInputSchema = z.object({
  // Either teamId (for team-based games) or null/omitted (for individual games).
  teamId: z.string().uuid().optional(),
  gameId: z.string().uuid(),
  formatId: z.string().uuid(),
  divisionId: z.string().uuid().optional(),
  preferredCity: z.string().max(100).optional(),
  preferredVenueId: z.string().uuid().optional(),
});
export type EnqueueInput = z.infer<typeof EnqueueInputSchema>;

export const LeaveQueueInputSchema = z.object({
  entryId: z.string().uuid(),
});
export type LeaveQueueInput = z.infer<typeof LeaveQueueInputSchema>;

export const AcceptFriendlyInputSchema = z.object({
  entryId: z.string().uuid(),
});
export type AcceptFriendlyInput = z.infer<typeof AcceptFriendlyInputSchema>;

export const RunMatchmakingPassInputSchema = z.object({
  gameId: z.string().uuid(),
  formatId: z.string().uuid(),
  divisionId: z.string().uuid().optional(),
});
export type RunMatchmakingPassInput = z.infer<typeof RunMatchmakingPassInputSchema>;
