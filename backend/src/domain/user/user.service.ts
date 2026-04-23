import { IUserRepository } from './user.interface';
import { NotFoundError, AuthorizationError, ValidationError } from '../../shared/errors';
import { UserMapper } from './user.mapper';
import { UserDTO } from './user.dto';
import { IRoleRepository } from '../role/role.interface';
import { AuditLogRepository } from '../audit/audit.repository';

export class UserService {
  private auditRepository = new AuditLogRepository();

  constructor(
    private userRepository: IUserRepository,
    private roleRepository: IRoleRepository,
  ) {}

  async getUserById(userId: string, requesterId: string): Promise<UserDTO> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User');
    }

    if (userId !== requesterId) {
      const hasPermission = await this.userRepository.hasPermission(
        requesterId,
        'users',
        'read'
      );
      if (!hasPermission) {
        throw new AuthorizationError('You do not have permission to view this user');
      }
    }

    return UserMapper.toDTO(user);
  }

  async getMe(userId: string): Promise<UserDTO> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User');
    }
    return UserMapper.toDTO(user);
  }

  async getUsers(
    page: number,
    limit: number,
    search: string | undefined,
    requesterId: string
  ): Promise<{ users: UserDTO[]; total: number; page: number; pages: number }> {
    const hasPermission = await this.userRepository.hasPermission(
      requesterId,
      'users',
      'read'
    );
    if (!hasPermission) {
      throw new AuthorizationError('You do not have permission to view users');
    }

    const skip = (page - 1) * limit;
    const { users, total } = await this.userRepository.findMany({
      skip,
      take: limit,
      search,
    });

    return {
      users: UserMapper.toDTOArray(users),
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  async updateUser(
    userId: string,
    data: { name?: string; avatar?: string; phone?: string; isActive?: boolean },
    requesterId: string
  ): Promise<UserDTO> {
    const isSelf = userId === requesterId;

    if (!isSelf) {
      const hasPermission = await this.userRepository.hasPermission(
        requesterId,
        'users',
        'update'
      );
      if (!hasPermission) {
        throw new AuthorizationError('You do not have permission to update this user');
      }
    }

    // Users cannot deactivate their own account — only an admin can do that
    if (isSelf && data.isActive === false) {
      throw new AuthorizationError('You cannot deactivate your own account');
    }

    const updatedUser = await this.userRepository.update(userId, data);
    const user = await this.userRepository.findById(updatedUser.id);
    if (!user) {
      throw new NotFoundError('User');
    }

    return UserMapper.toDTO(user);
  }

  async deleteUser(userId: string, requesterId: string, meta?: { ipAddress?: string; userAgent?: string }): Promise<void> {
    const hasPermission = await this.userRepository.hasPermission(
      requesterId,
      'users',
      'delete'
    );
    if (!hasPermission) {
      throw new AuthorizationError('You do not have permission to delete users');
    }

    if (userId === requesterId) {
      throw new AuthorizationError('You cannot delete your own account');
    }

    await this.userRepository.delete(userId);

    this.auditRepository.create({
      userId: requesterId,
      action: 'user.delete',
      resource: 'user',
      details: { deletedUserId: userId },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    }).catch(console.error);
  }

  async assignRoles(
    userId: string,
    roleIds: string[],
    requesterId: string,
    meta?: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    const hasPermission = await this.userRepository.hasPermission(
      requesterId,
      'users',
      'update'
    );
    if (!hasPermission) {
      throw new AuthorizationError('You do not have permission to assign roles');
    }

    const targetUser = await this.userRepository.findById(userId);
    if (!targetUser) throw new NotFoundError('User');

    if (roleIds.length > 0) {
      const invalid: string[] = [];
      for (const roleId of roleIds) {
        const role = await this.roleRepository.findById(roleId);
        if (!role) invalid.push(roleId);
      }
      if (invalid.length > 0) {
        throw new ValidationError(`Role(s) not found: ${invalid.join(', ')}`);
      }
    }

    await this.userRepository.assignRoles(userId, roleIds);

    this.auditRepository.create({
      userId: requesterId,
      action: 'user.assignRoles',
      resource: 'user',
      details: { targetUserId: userId, roleIds },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    }).catch(console.error);
  }
}
