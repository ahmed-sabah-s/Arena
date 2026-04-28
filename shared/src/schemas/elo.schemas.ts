import { z } from 'zod';

export const MatchResultSchema = z.enum(['win', 'loss', 'draw']);
export type MatchResult = z.infer<typeof MatchResultSchema>;

export const FormResultSchema = z.enum(['W', 'L', 'D']);
export type FormResult = z.infer<typeof FormResultSchema>;

export const TierSchema = z.enum(['bronze', 'silver', 'gold', 'platinum', 'elite']);
export type Tier = z.infer<typeof TierSchema>;

const eloEntityBase = {
  id: z.string().uuid(),
  gameId: z.string().uuid(),
  formatId: z.string().uuid(),
  divisionId: z.string().uuid().nullable(),
  seasonId: z.string().uuid().nullable(),
  elo: z.number().int(),
  mmr: z.number().int(),
  matchesPlayed: z.number().int().nonnegative(),
  matchesWon: z.number().int().nonnegative(),
  matchesLost: z.number().int().nonnegative(),
  matchesDrawn: z.number().int().nonnegative(),
  calibrationCompleteAt: z.coerce.date().nullable(),
  lastMatchAt: z.coerce.date().nullable(),
  form: z.array(FormResultSchema).max(5),
  highestElo: z.number().int(),
  highestMmr: z.number().int(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
};

export const TeamEloSchema = z.object({
  ...eloEntityBase,
  teamId: z.string().uuid(),
});
export type TeamElo = z.infer<typeof TeamEloSchema>;

export const PlayerEloSchema = z.object({
  ...eloEntityBase,
  userId: z.string().uuid(),
});
export type PlayerElo = z.infer<typeof PlayerEloSchema>;
