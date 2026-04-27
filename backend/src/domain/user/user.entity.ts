export type Gender = 'male' | 'female' | 'prefer_not_say';
export type PreferredLanguage = 'ar' | 'en';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export interface User {
  id: string;
  email: string | null;
  password: string | null;
  phone: string;
  fullName: string;
  avatar: string | null;
  gender: Gender | null;
  city: string | null;
  country: string;
  preferredLanguage: PreferredLanguage;
  preferredCurrency: string;
  experienceLevel: ExperienceLevel | null;
  isActive: boolean;
  emailVerified: boolean;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  onboardingCompletedAt: Date | null;
  twoFactorSecret: string | null;
  twoFactorEnabled: boolean;
  lastLoginAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserWithRoles extends User {
  roles: Array<{
    id: string;
    name: string;
    permissions: Array<{
      id: string;
      name: string;
      resource: string;
      action: string;
    }>;
  }>;
}
