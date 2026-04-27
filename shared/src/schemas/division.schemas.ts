import { z } from 'zod';

export const GenderRestrictionSchema = z.enum(['male', 'female', 'mixed']);
export type GenderRestriction = z.infer<typeof GenderRestrictionSchema>;

export const DivisionSchema = z.object({
  id: z.string().uuid(),
  gameId: z.string().uuid(),
  slug: z.string().max(50),
  name: z.string().max(100),
  nameAr: z.string().max(100),
  genderRestriction: GenderRestrictionSchema.nullable(),
  isActive: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Division = z.infer<typeof DivisionSchema>;
