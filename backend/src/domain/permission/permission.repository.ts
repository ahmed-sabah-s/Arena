import { query } from '../../db';
import { IPermissionRepository } from './permission.interface';
import { Permission } from './permission.entity';
import { AppError, NotFoundError, ConflictError } from '../../shared/errors';

const UPDATABLE_COLUMNS = new Set(['name', 'description']);

export class PermissionRepository implements IPermissionRepository {
  async findById(id: string): Promise<Permission | null> {
    const [row] = await query<Permission>(`SELECT * FROM permission WHERE id = :id`, { id });
    return row ?? null;
  }

  async findByName(name: string): Promise<Permission | null> {
    const [row] = await query<Permission>(`SELECT * FROM permission WHERE name = :name`, { name });
    return row ?? null;
  }

  async findByResourceAction(resource: string, action: string): Promise<Permission | null> {
    const [row] = await query<Permission>(
      `SELECT * FROM permission WHERE resource = :resource AND action = :action`,
      { resource, action }
    );
    return row ?? null;
  }

  async findMany(): Promise<Permission[]> {
    return query<Permission>(`SELECT * FROM permission ORDER BY resource, action`);
  }

  async create(data: {
    name: string;
    resource: string;
    action: string;
    description?: string;
  }): Promise<Permission> {
    try {
      const [row] = await query<Permission>(
        `INSERT INTO permission (name, resource, action, description)
         VALUES (:name, :resource, :action, :description) RETURNING *`,
        { name: data.name, resource: data.resource, action: data.action, description: data.description ?? null }
      );
      if (!row) throw new AppError('Failed to create permission', 500);
      return row;
    } catch (err: any) {
      if (err.code === '23505') throw new ConflictError('A permission with this name or resource/action already exists');
      throw err;
    }
  }

  async update(id: string, data: Partial<Permission>): Promise<Permission> {
    const fields: string[] = [];
    const params: Record<string, any> = { id };

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && key !== 'id' && UPDATABLE_COLUMNS.has(key)) {
        fields.push(`"${key}" = :${key}`);
        params[key] = value;
      }
    }

    if (fields.length === 0) {
      const existing = await this.findById(id);
      if (!existing) throw new NotFoundError('Permission');
      return existing;
    }

    const [row] = await query<Permission>(
      `UPDATE permission SET ${fields.join(', ')} WHERE id = :id RETURNING *`,
      params
    );
    if (!row) throw new NotFoundError('Permission');
    return row;
  }

  async delete(id: string): Promise<void> {
    await query(`DELETE FROM permission WHERE id = :id`, { id });
  }
}
