import { z } from 'zod';

export const ParticipantTypeSchema = z.enum(['team', 'individual']);
export type ParticipantType = z.infer<typeof ParticipantTypeSchema>;

export const EloOwnerSchema = z.enum(['team', 'individual']);
export type EloOwner = z.infer<typeof EloOwnerSchema>;

export const MatchModeSchema = z.enum(['refereed', 'player_stats', 'score_only']);
export type MatchMode = z.infer<typeof MatchModeSchema>;

export const GameSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().max(50),
  name: z.string().max(100),
  nameAr: z.string().max(100),
  iconKey: z.string().max(100).nullable(),
  participantType: ParticipantTypeSchema,
  eloOwner: EloOwnerSchema,
  allowedMatchModes: z.array(MatchModeSchema),
  hasStats: z.boolean(),
  // statSchema is a free-form JSONB definition; typed loosely until Phase 5 tightens it.
  statSchema: z.unknown().nullable(),
  supportsDivisions: z.boolean(),
  supportsGenderDivisions: z.boolean(),
  isActive: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Game = z.infer<typeof GameSchema>;
