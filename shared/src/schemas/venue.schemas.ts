import { z } from 'zod';

// ─── enums ──────────────────────────────────────────────────────────────────

export const VenueStatusSchema = z.enum([
  'pending_approval',
  'active',
  'paused',
  'rejected',
  'archived',
]);
export type VenueStatus = z.infer<typeof VenueStatusSchema>;

export const VenuePricingModelSchema = z.enum(['hourly', 'per_game', 'per_session']);
export type VenuePricingModel = z.infer<typeof VenuePricingModelSchema>;

// ─── entities ───────────────────────────────────────────────────────────────

export const VenueSchema = z.object({
  id: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  name: z.string().min(1).max(150),
  nameAr: z.string().max(150).nullable(),
  description: z.string().nullable(),
  city: z.string().min(1).max(100),
  district: z.string().max(100).nullable(),
  address: z.string().nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  country: z.string().length(2),
  defaultCurrency: z.string().length(3),
  contactPhone: z.string().nullable(),
  contactEmail: z.string().email().nullable(),
  status: VenueStatusSchema,
  approvedAt: z.coerce.date().nullable(),
  approvedByUserId: z.string().uuid().nullable(),
  rejectionReason: z.string().nullable(),
  primaryPhotoFileId: z.string().uuid().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  deletedAt: z.coerce.date().nullable(),
});
export type Venue = z.infer<typeof VenueSchema>;

export const VenueGameConfigSchema = z.object({
  id: z.string().uuid(),
  venueId: z.string().uuid(),
  gameId: z.string().uuid(),
  pricingModel: VenuePricingModelSchema,
  priceAmount: z.number().int().nonnegative(),
  priceCurrency: z.string().length(3),
  minBookingMinutes: z.number().int().positive().nullable(),
  maxBookingMinutes: z.number().int().positive().nullable(),
  capacity: z.number().int().positive(),
  isActive: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type VenueGameConfig = z.infer<typeof VenueGameConfigSchema>;

// HH:mm or HH:mm:ss; we accept either and convert at the boundary.
const TimeStringSchema = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Expected HH:mm or HH:mm:ss');

export const VenueAvailabilityRuleSchema = z.object({
  id: z.string().uuid(),
  venueId: z.string().uuid(),
  dayOfWeek: z.number().int().min(0).max(6),
  openTime: TimeStringSchema,
  closeTime: TimeStringSchema,
  isActive: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type VenueAvailabilityRule = z.infer<typeof VenueAvailabilityRuleSchema>;

export const VenueAvailabilityBlackoutSchema = z.object({
  id: z.string().uuid(),
  venueId: z.string().uuid(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  reason: z.string().max(200).nullable(),
  createdByUserId: z.string().uuid(),
  createdAt: z.coerce.date(),
});
export type VenueAvailabilityBlackout = z.infer<typeof VenueAvailabilityBlackoutSchema>;

// ─── inputs ─────────────────────────────────────────────────────────────────

export const CreateVenueInputSchema = z.object({
  name: z.string().min(1).max(150),
  nameAr: z.string().max(150).optional(),
  description: z.string().max(5000).optional(),
  city: z.string().min(1).max(100),
  district: z.string().max(100).optional(),
  address: z.string().max(500).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  country: z.string().length(2).default('IQ'),
  defaultCurrency: z.string().length(3).default('IQD'),
  contactPhone: z.string().max(50).optional(),
  contactEmail: z.string().email().optional(),
  primaryPhotoFileId: z.string().uuid().optional(),
});
export type CreateVenueInput = z.infer<typeof CreateVenueInputSchema>;

export const UpdateVenueInputSchema = z.object({
  venueId: z.string().uuid(),
  name: z.string().min(1).max(150).optional(),
  nameAr: z.string().max(150).optional(),
  description: z.string().max(5000).optional(),
  city: z.string().min(1).max(100).optional(),
  district: z.string().max(100).optional(),
  address: z.string().max(500).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  contactPhone: z.string().max(50).optional(),
  contactEmail: z.string().email().optional(),
  primaryPhotoFileId: z.string().uuid().optional(),
});
export type UpdateVenueInput = z.infer<typeof UpdateVenueInputSchema>;

export const UpsertVenueGameConfigInputSchema = z.object({
  venueId: z.string().uuid(),
  gameId: z.string().uuid(),
  pricingModel: VenuePricingModelSchema,
  priceAmount: z.number().int().nonnegative(),
  priceCurrency: z.string().length(3),
  minBookingMinutes: z.number().int().positive().optional(),
  maxBookingMinutes: z.number().int().positive().optional(),
  capacity: z.number().int().positive().default(1),
  isActive: z.boolean().default(true),
});
export type UpsertVenueGameConfigInput = z.infer<typeof UpsertVenueGameConfigInputSchema>;

export const AddAvailabilityRuleInputSchema = z.object({
  venueId: z.string().uuid(),
  dayOfWeek: z.number().int().min(0).max(6),
  openTime: TimeStringSchema,
  closeTime: TimeStringSchema,
});
export type AddAvailabilityRuleInput = z.infer<typeof AddAvailabilityRuleInputSchema>;

export const RemoveAvailabilityRuleInputSchema = z.object({
  ruleId: z.string().uuid(),
});
export type RemoveAvailabilityRuleInput = z.infer<typeof RemoveAvailabilityRuleInputSchema>;

export const AddBlackoutInputSchema = z.object({
  venueId: z.string().uuid(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  reason: z.string().max(200).optional(),
});
export type AddBlackoutInput = z.infer<typeof AddBlackoutInputSchema>;

export const RemoveBlackoutInputSchema = z.object({
  blackoutId: z.string().uuid(),
});
export type RemoveBlackoutInput = z.infer<typeof RemoveBlackoutInputSchema>;

export const CheckAvailabilityInputSchema = z.object({
  venueId: z.string().uuid(),
  timestamp: z.coerce.date(),
});
export type CheckAvailabilityInput = z.infer<typeof CheckAvailabilityInputSchema>;

export const ApproveVenueInputSchema = z.object({
  venueId: z.string().uuid(),
});
export type ApproveVenueInput = z.infer<typeof ApproveVenueInputSchema>;

export const RejectVenueInputSchema = z.object({
  venueId: z.string().uuid(),
  reason: z.string().max(2000),
});
export type RejectVenueInput = z.infer<typeof RejectVenueInputSchema>;

export const PauseVenueInputSchema = z.object({
  venueId: z.string().uuid(),
});
export type PauseVenueInput = z.infer<typeof PauseVenueInputSchema>;

export const ResumeVenueInputSchema = z.object({
  venueId: z.string().uuid(),
});
export type ResumeVenueInput = z.infer<typeof ResumeVenueInputSchema>;

export const ArchiveVenueInputSchema = z.object({
  venueId: z.string().uuid(),
});
export type ArchiveVenueInput = z.infer<typeof ArchiveVenueInputSchema>;

export const SearchVenuesInCityInputSchema = z.object({
  city: z.string().min(1).max(100),
});
export type SearchVenuesInCityInput = z.infer<typeof SearchVenuesInCityInputSchema>;

export const GetVenueByIdInputSchema = z.object({
  venueId: z.string().uuid(),
});
export type GetVenueByIdInput = z.infer<typeof GetVenueByIdInputSchema>;
