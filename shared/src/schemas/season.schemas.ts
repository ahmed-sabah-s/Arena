import { z } from 'zod';

export const SeasonStatusSchema = z.enum(['upcoming', 'active', 'completed', 'cancelled']);
export type SeasonStatus = z.infer<typeof SeasonStatusSchema>;

export const SeasonSchema = z.object({
  id: z.string().uuid(),
  gameId: z.string().uuid(),
  slug: z.string().max(50),
  name: z.string().max(100),
  nameAr: z.string().max(100),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  // prizePoolAmount is a BIGINT column. Using number here because money values for Arena
  // fit safely within JS Number's safe integer range (< 2^53). Bigint would complicate
  // JSON serialization across all consumers.
  prizePoolAmount: z.coerce.number().int().nonnegative(),
  prizePoolCurrency: z.string().length(3),
  status: SeasonStatusSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Season = z.infer<typeof SeasonSchema>;
