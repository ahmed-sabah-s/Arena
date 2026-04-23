import { User, UserWithRoles } from './user.entity';

export interface IUserRepository {
  findById(id: string): Promise<UserWithRoles | null>;
  findByEmail(email: string): Promise<UserWithRoles | null>;
  findMany(options: {
    skip?: number;
    take?: number;
    search?: string;
  }): Promise<{ users: UserWithRoles[]; total: number }>;
  create(data: {
    email: string;
    password: string;
    name: string;
    phone?: string;
  }): Promise<User>;
  update(id: string, data: Partial<User>): Promise<User>;
  delete(id: string): Promise<void>;
  assignRoles(userId: string, roleIds: string[]): Promise<void>;
  removeRoles(userId: string, roleIds: string[]): Promise<void>;
  hasPermission(userId: string, resource: string, action: string): Promise<boolean>;
}
