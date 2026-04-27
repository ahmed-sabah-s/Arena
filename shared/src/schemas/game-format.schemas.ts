import { z } from 'zod';

export const GameFormatSchema = z.object({
  id: z.string().uuid(),
  gameId: z.string().uuid(),
  slug: z.string().max(50),
  name: z.string().max(100),
  nameAr: z.string().max(100),
  minPlayersPerSide: z.number().int().positive(),
  maxPlayersPerSide: z.number().int().positive(),
  minRosterSize: z.number().int().positive(),
  maxRosterSize: z.number().int().positive(),
  matchDurationMinutes: z.number().int().positive().nullable(),
  isActive: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type GameFormat = z.infer<typeof GameFormatSchema>;
