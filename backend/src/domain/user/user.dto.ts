import { z } from 'zod';

export const UserDTOSchema = z.object({
  id: z.string(),
  email: z.string().nullable(),
  phone: z.string(),
  fullName: z.string(),
  avatar: z.string().nullable(),
  gender: z.enum(['male', 'female', 'prefer_not_say']).nullable(),
  city: z.string().nullable(),
  country: z.string(),
  preferredLanguage: z.enum(['ar', 'en']),
  preferredCurrency: z.string(),
  experienceLevel: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).nullable(),
  isActive: z.boolean(),
  emailVerified: z.boolean(),
  emailVerifiedAt: z.date().nullable(),
  phoneVerifiedAt: z.date().nullable(),
  onboardingCompletedAt: z.date().nullable(),
  twoFactorEnabled: z.boolean(),
  lastLoginAt: z.date().nullable(),
  roles: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      permissions: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          resource: z.string(),
          action: z.string(),
        }),
      ),
    }),
  ),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type UserDTO = z.infer<typeof UserDTOSchema>;
