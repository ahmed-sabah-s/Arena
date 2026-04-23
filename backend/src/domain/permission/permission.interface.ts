import { Permission } from './permission.entity';

export interface IPermissionRepository {
  findById(id: string): Promise<Permission | null>;
  findByName(name: string): Promise<Permission | null>;
  findByResourceAction(resource: string, action: string): Promise<Permission | null>;
  findMany(): Promise<Permission[]>;
  create(data: {
    name: string;
    resource: string;
    action: string;
    description?: string;
  }): Promise<Permission>;
  update(id: string, data: Partial<Permission>): Promise<Permission>;
  delete(id: string): Promise<void>;
}
