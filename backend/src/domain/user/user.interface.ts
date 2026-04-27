import { User, UserWithRoles } from './user.entity';

export interface CreateUserData {
  phone: string;
  email?: string | null;
  password?: string | null;
  fullName?: string | null;
  avatar?: string | null;
  gender?: User['gender'];
  city?: string | null;
  country?: string;
  preferredLanguage?: User['preferredLanguage'];
  preferredCurrency?: string;
  experienceLevel?: User['experienceLevel'];
  phoneVerifiedAt?: Date | null;
}

export interface IUserRepository {
  findById(id: string): Promise<UserWithRoles | null>;
  findByEmail(email: string): Promise<UserWithRoles | null>;
  findByPhone(phone: string): Promise<UserWithRoles | null>;
  findMany(options: {
    skip?: number;
    take?: number;
    search?: string;
  }): Promise<{ users: UserWithRoles[]; total: number }>;
  create(data: CreateUserData): Promise<User>;
  update(id: string, data: Partial<User>): Promise<User>;
  delete(id: string): Promise<void>;
  assignRoles(userId: string, roleIds: string[]): Promise<void>;
  removeRoles(userId: string, roleIds: string[]): Promise<void>;
  hasPermission(userId: string, resource: string, action: string): Promise<boolean>;
}
