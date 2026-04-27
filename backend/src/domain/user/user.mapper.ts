import { UserWithRoles } from './user.entity';
import { UserDTO } from './user.dto';

export class UserMapper {
  static toDTO(user: UserWithRoles): UserDTO {
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      fullName: user.fullName,
      avatar: user.avatar,
      gender: user.gender,
      city: user.city,
      country: user.country,
      preferredLanguage: user.preferredLanguage,
      preferredCurrency: user.preferredCurrency,
      experienceLevel: user.experienceLevel,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      emailVerifiedAt: user.emailVerifiedAt,
      phoneVerifiedAt: user.phoneVerifiedAt,
      onboardingCompletedAt: user.onboardingCompletedAt,
      twoFactorEnabled: user.twoFactorEnabled,
      lastLoginAt: user.lastLoginAt,
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
