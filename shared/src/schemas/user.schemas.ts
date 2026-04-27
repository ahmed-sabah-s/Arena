import { z } from 'zod';
import { PhoneSchema, OtpCodeSchema } from './auth.schemas';

export const userIdSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
});

export const GenderSchema = z.enum(['male', 'female', 'prefer_not_say']);
export type Gender = z.infer<typeof GenderSchema>;

export const PreferredLanguageSchema = z.enum(['ar', 'en']);
export type PreferredLanguage = z.infer<typeof PreferredLanguageSchema>;

export const UserExperienceLevelSchema = z.enum(['beginner', 'intermediate', 'advanced', 'expert']);
export type UserExperienceLevel = z.infer<typeof UserExperienceLevelSchema>;

// Full user DTO — mirrors the user table after Phase 1 + Phase 2 + Phase 3 migrations.
// password is intentionally omitted: it is never returned to clients.
// `name` was dropped in migration 012; `fullName` is the only name field.
export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email().nullable(),
  phone: z.string(),
  fullName: z.string(),
  avatar: z.string().nullable(),
  gender: GenderSchema.nullable(),
  city: z.string().nullable(),
  country: z.string().length(2),
  preferredLanguage: PreferredLanguageSchema,
  preferredCurrency: z.string().length(3),
  experienceLevel: UserExperienceLevelSchema.nullable(),
  isActive: z.boolean(),
  emailVerified: z.boolean(),
  emailVerifiedAt: z.coerce.date().nullable(),
  phoneVerifiedAt: z.coerce.date().nullable(),
  onboardingCompletedAt: z.coerce.date().nullable(),
  twoFactorEnabled: z.boolean(),
  lastLoginAt: z.coerce.date().nullable(),
  deletedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type User = z.infer<typeof UserSchema>;

// ─── Phase 2 input schemas ───────────────────────────────────────────────────

export const CompleteOnboardingInputSchema = z.object({
  fullName: z.string().min(2).max(255),
  gender: GenderSchema.optional(),
  city: z.string().min(1).max(100),
  preferredLanguage: PreferredLanguageSchema,
  preferredCurrency: z.string().length(3),
  experienceLevel: UserExperienceLevelSchema,
});
export type CompleteOnboardingInput = z.infer<typeof CompleteOnboardingInputSchema>;

export const UpdateProfileInputSchema = z.object({
  fullName: z.string().min(2).max(255).optional(),
  gender: GenderSchema.optional(),
  city: z.string().min(1).max(100).optional(),
  preferredLanguage: PreferredLanguageSchema.optional(),
  preferredCurrency: z.string().length(3).optional(),
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileInputSchema>;

const StrongPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const SetEmailAndPasswordInputSchema = z.object({
  email: z.string().email(),
  password: StrongPasswordSchema,
});
export type SetEmailAndPasswordInput = z.infer<typeof SetEmailAndPasswordInputSchema>;

export const ChangePasswordInputSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: StrongPasswordSchema,
});
export type ChangePasswordInput = z.infer<typeof ChangePasswordInputSchema>;

export const RequestPhoneChangeInputSchema = z.object({
  newPhone: PhoneSchema,
});
export type RequestPhoneChangeInput = z.infer<typeof RequestPhoneChangeInputSchema>;

export const VerifyPhoneChangeInputSchema = z.object({
  newPhone: PhoneSchema,
  code: OtpCodeSchema,
});
export type VerifyPhoneChangeInput = z.infer<typeof VerifyPhoneChangeInputSchema>;

// ─── Pagination / list inputs (legacy compatibility) ────────────────────────

export const updateUserSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  fullName: z.string().optional(),
  avatar: z.string().url().optional(),
  gender: GenderSchema.optional(),
  city: z.string().optional(),
  country: z.string().length(2).optional(),
  preferredLanguage: PreferredLanguageSchema.optional(),
  preferredCurrency: z.string().length(3).optional(),
  isActive: z.boolean().optional(),
});

export const searchUsersSchema = z.object({
  searchTerm: z.string().min(1),
  limit: z.number().min(1).max(100).default(50),
});

export const paginationSchema = z.object({
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
