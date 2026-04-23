export interface User {
  id: string;
  email: string;
  password: string;
  name: string;
  avatar?: string;
  phone?: string;
  isActive: boolean;
  emailVerified: boolean;
  emailVerifiedAt?: Date;
  twoFactorSecret?: string | null;
  twoFactorEnabled: boolean;
  lastLoginAt?: Date;
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
