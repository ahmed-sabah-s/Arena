import { IPermissionRepository } from './permission.interface';
import { IUserRepository } from '../user';
import { AuthorizationError, ConflictError } from '../../shared/errors';
import { PermissionDTO } from './permission.dto';
import { AuditLogRepository } from '../audit/audit.repository';

export class PermissionService {
  private auditRepository = new AuditLogRepository();

  constructor(
    private permissionRepository: IPermissionRepository,
    private userRepository: IUserRepository
  ) {}

  async getPermissions(requesterId: string): Promise<PermissionDTO[]> {
    const hasPermission = await this.userRepository.hasPermission(
      requesterId,
      'permissions',
      'read'
    );
    if (!hasPermission) {
      throw new AuthorizationError('You do not have permission to view permissions');
    }

    return this.permissionRepository.findMany();
  }

  async createPermission(
    data: { name: string; resource: string; action: string; description?: string },
    requesterId: string,
    meta?: { ipAddress?: string; userAgent?: string }
  ): Promise<PermissionDTO> {
    const hasPermission = await this.userRepository.hasPermission(
      requesterId,
      'permissions',
      'create'
    );
    if (!hasPermission) {
      throw new AuthorizationError('You do not have permission to create permissions');
    }

    const existingByName = await this.permissionRepository.findByName(data.name);
    if (existingByName) {
      throw new ConflictError('Permission with this name already exists');
    }

    const existingByAction = await this.permissionRepository.findByResourceAction(data.resource, data.action);
    if (existingByAction) {
      throw new ConflictError(`Permission for ${data.resource}:${data.action} already exists`);
    }

    const created = await this.permissionRepository.create(data);

    this.auditRepository.create({
      userId: requesterId,
      action: 'permission.create',
      resource: 'permission',
      details: { name: data.name, resource: data.resource, action: data.action },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    }).catch(console.error);

    return created;
  }
}
