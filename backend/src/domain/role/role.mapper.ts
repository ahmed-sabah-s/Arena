import { RoleWithPermissions } from './role.entity';
import { RoleDTO } from './role.dto';

export class RoleMapper {
  static toDTO(role: RoleWithPermissions): RoleDTO {
    return {
      id: role.id,
      name: role.name,
      description: role.description || null,
      permissions: role.permissions.map((permission) => ({
        id: permission.id,
        name: permission.name,
        resource: permission.resource,
        action: permission.action,
      })),
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }

  static toDTOArray(roles: RoleWithPermissions[]): RoleDTO[] {
    return roles.map((role) => this.toDTO(role));
  }
}
