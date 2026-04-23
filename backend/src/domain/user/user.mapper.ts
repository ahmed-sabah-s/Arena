import { UserWithRoles } from './user.entity';
import { UserDTO } from './user.dto';

export class UserMapper {
  static toDTO(user: UserWithRoles): UserDTO {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar || null,
      phone: user.phone || null,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      twoFactorEnabled: user.twoFactorEnabled,
      roles: user.roles.map((role) => ({
        id: role.id,
        name: role.name,
        permissions: role.permissions.map((permission) => ({
          id: permission.id,
          name: permission.name,
          resource: permission.resource,
          action: permission.action,
        })),
      })),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  static toDTOArray(users: UserWithRoles[]): UserDTO[] {
    return users.map((user) => this.toDTO(user));
  }
}
