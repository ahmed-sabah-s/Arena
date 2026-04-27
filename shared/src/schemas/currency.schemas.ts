import { z } from 'zod';

export const RoundingModeSchema = z.enum(['ceil', 'nearest', 'floor']);
export type RoundingMode = z.infer<typeof RoundingModeSchema>;

export const CurrencySchema = z.object({
  code: z.string().length(3),
  name: z.string(),
  nameAr: z.string(),
  symbol: z.string().nullable(),
  subunitFactor: z.number().int().positive(),
  displayRoundingStep: z.number().int().positive(),
  displayRoundingMode: RoundingModeSchema,
  isActive: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Currency = z.infer<typeof CurrencySchema>;
