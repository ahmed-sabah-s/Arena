import { Role, RoleWithPermissions } from './role.entity';

export interface IRoleRepository {
  findById(id: string): Promise<RoleWithPermissions | null>;
  findByName(name: string): Promise<RoleWithPermissions | null>;
  findMany(): Promise<RoleWithPermissions[]>;
  create(data: {
    name: string;
    description?: string;
    permissionIds?: string[];
  }): Promise<Role>;
  update(id: string, data: {
    name?: string;
    description?: string;
    permissionIds?: string[];
  }): Promise<Role>;
  delete(id: string): Promise<void>;
}
