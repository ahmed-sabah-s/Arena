import { IRoleRepository } from './role.interface';
import { IUserRepository } from '../user';
import { NotFoundError, AuthorizationError, ConflictError } from '../../shared/errors';
import { RoleMapper } from './role.mapper';
import { RoleDTO } from './role.dto';

export class RoleService {
  constructor(
    private roleRepository: IRoleRepository,
    private userRepository: IUserRepository
  ) {}

  async getRoles(requesterId: string): Promise<RoleDTO[]> {
    const hasPermission = await this.userRepository.hasPermission(
      requesterId,
      'roles',
      'read'
    );
    if (!hasPermission) {
      throw new AuthorizationError('You do not have permission to view roles');
    }

    const roles = await this.roleRepository.findMany();
    return RoleMapper.toDTOArray(roles);
  }

  async getRoleById(roleId: string, requesterId: string): Promise<RoleDTO> {
    const hasPermission = await this.userRepository.hasPermission(
      requesterId,
      'roles',
      'read'
    );
    if (!hasPermission) {
      throw new AuthorizationError('You do not have permission to view roles');
    }

    const role = await this.roleRepository.findById(roleId);
    if (!role) {
      throw new NotFoundError('Role');
    }

    return RoleMapper.toDTO(role);
  }

  async createRole(
    data: { name: string; description?: string; permissionIds?: string[] },
    requesterId: string
  ): Promise<RoleDTO> {
    const hasPermission = await this.userRepository.hasPermission(
      requesterId,
      'roles',
      'create'
    );
    if (!hasPermission) {
      throw new AuthorizationError('You do not have permission to create roles');
    }

    const existing = await this.roleRepository.findByName(data.name);
    if (existing) {
      throw new ConflictError('Role with this name already exists');
    }

    const role = await this.roleRepository.create(data);
    const createdRole = await this.roleRepository.findById(role.id);
    if (!createdRole) {
      throw new NotFoundError('Role');
    }

    return RoleMapper.toDTO(createdRole);
  }

  async updateRole(
    roleId: string,
    data: { name?: string; description?: string; permissionIds?: string[] },
    requesterId: string
  ): Promise<RoleDTO> {
    const hasPermission = await this.userRepository.hasPermission(
      requesterId,
      'roles',
      'update'
    );
    if (!hasPermission) {
      throw new AuthorizationError('You do not have permission to update roles');
    }

    const existingRole = await this.roleRepository.findById(roleId);
    if (!existingRole) {
      throw new NotFoundError('Role');
    }

    if (data.name && data.name !== existingRole.name) {
      const nameConflict = await this.roleRepository.findByName(data.name);
      if (nameConflict) {
        throw new ConflictError('Role with this name already exists');
      }
    }

    const role = await this.roleRepository.update(roleId, data);
    const updatedRole = await this.roleRepository.findById(role.id);
    if (!updatedRole) {
      throw new NotFoundError('Role');
    }

    return RoleMapper.toDTO(updatedRole);
  }

  async deleteRole(roleId: string, requesterId: string): Promise<void> {
    const hasPermission = await this.userRepository.hasPermission(
      requesterId,
      'roles',
      'delete'
    );
    if (!hasPermission) {
      throw new AuthorizationError('You do not have permission to delete roles');
    }

    const role = await this.roleRepository.findById(roleId);
    if (!role) {
      throw new NotFoundError('Role');
    }

    await this.roleRepository.delete(roleId);
  }
}
