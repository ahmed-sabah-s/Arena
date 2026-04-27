import { z } from 'zod';

export const TeamStatusSchema = z.enum(['active', 'disbanded']);
export type TeamStatus = z.infer<typeof TeamStatusSchema>;

const HexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a hex code like #RRGGBB');

export const TeamSchema = z.object({
  id: z.string().uuid(),
  gameId: z.string().uuid(),
  formatId: z.string().uuid(),
  divisionId: z.string().uuid().nullable(),
  captainId: z.string().uuid(),
  name: z.string().min(1).max(100),
  nameAr: z.string().max(100).nullable(),
  slug: z.string().max(100),
  city: z.string().max(100).nullable(),
  badgeFileId: z.string().uuid().nullable(),
  primaryColor: HexColorSchema.nullable(),
  status: TeamStatusSchema,
  foundedAt: z.coerce.date(),
  disbandedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Team = z.infer<typeof TeamSchema>;

export const CreateTeamInputSchema = z.object({
  gameId: z.string().uuid(),
  formatId: z.string().uuid(),
  divisionId: z.string().uuid().optional(),
  name: z.string().min(2).max(100),
  nameAr: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  primaryColor: HexColorSchema.optional(),
});
export type CreateTeamInput = z.infer<typeof CreateTeamInputSchema>;

export const UpdateTeamInputSchema = z.object({
  teamId: z.string().uuid(),
  name: z.string().min(2).max(100).optional(),
  nameAr: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  primaryColor: HexColorSchema.optional(),
  badgeFileId: z.string().uuid().optional(),
});
export type UpdateTeamInput = z.infer<typeof UpdateTeamInputSchema>;

export const TransferCaptaincyInputSchema = z.object({
  teamId: z.string().uuid(),
  newCaptainUserId: z.string().uuid(),
});
export type TransferCaptaincyInput = z.infer<typeof TransferCaptaincyInputSchema>;

export const DisbandTeamInputSchema = z.object({
  teamId: z.string().uuid(),
  reason: z.string().max(500).optional(),
});
export type DisbandTeamInput = z.infer<typeof DisbandTeamInputSchema>;
