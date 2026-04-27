import { query, transaction } from '../../db';
import { IRoleRepository } from './role.interface';
import { Role, RoleWithPermissions } from './role.entity';
import { AppError, NotFoundError, ValidationError, isPgError } from '../../shared/errors';

interface PermissionRow {
  id: string;
  name: string;
  resource: string;
  action: string;
}

interface RoleQueryRow {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  permissions: PermissionRow[] | null;
}

const roleWithPermissionsQuery = `
  SELECT r.id, r.name, r.description,
    r."createdAt", r."updatedAt",
    COALESCE(
      (
        SELECT json_agg(json_build_object('id', p.id, 'name', p.name, 'resource', p.resource, 'action', p.action))
        FROM "rolePermission" rp
        JOIN permission p ON rp."permissionId" = p.id
        WHERE rp."roleId" = r.id
      ),
      '[]'
    )::json as permissions
  FROM role r
`;

export class RoleRepository implements IRoleRepository {
  async findById(id: string): Promise<RoleWithPermissions | null> {
    const [row] = await query<RoleQueryRow>(`${roleWithPermissionsQuery} WHERE r.id = :id`, { id });
    return row ? this.mapRow(row) : null;
  }

  async findByName(name: string): Promise<RoleWithPermissions | null> {
    const [row] = await query<RoleQueryRow>(`${roleWithPermissionsQuery} WHERE r.name = :name`, { name });
    return row ? this.mapRow(row) : null;
  }

  async findMany(): Promise<RoleWithPermissions[]> {
    const rows = await query<RoleQueryRow>(`${roleWithPermissionsQuery} ORDER BY r.name ASC`);
    return rows.map((row) => this.mapRow(row));
  }

  async create(data: {
    name: string;
    description?: string;
    permissionIds?: string[];
  }): Promise<Role> {
    try {
      // Role insert and permission inserts are in one transaction so a permission
      // failure rolls back the role as well — no partial/ghost role in the DB.
      return await transaction(async (client) => {
        const result = await client.query<Role>(
          `INSERT INTO role (name, description)
           VALUES (:name, :description)
           RETURNING id, name, description, "createdAt", "updatedAt"`,
          { name: data.name, description: data.description ?? null }
        );
        const row = result.rows[0];
        if (!row) throw new AppError('Failed to create role', 500);

        for (const permissionId of data.permissionIds ?? []) {
          await client.query(
            `INSERT INTO "rolePermission" ("roleId", "permissionId") VALUES (:roleId, :permissionId)
             ON CONFLICT ("roleId", "permissionId") DO NOTHING`,
            { roleId: row.id, permissionId }
          );
        }

        return row;
      });
    } catch (err: unknown) {
      if (isPgError(err)) {
        if (err.code === '23503') throw new ValidationError('One or more permission IDs do not exist');
        if (err.code === '23505') throw new ValidationError('A role with this name already exists');
      }
      throw err;
    }
  }

  async update(
    id: string,
    data: { name?: string; description?: string; permissionIds?: string[] }
  ): Promise<Role> {
    const fields: string[] = [];
    const params: Record<string, unknown> = { id };

    if (data.name !== undefined) { fields.push('name = :name'); params.name = data.name; }
    if (data.description !== undefined) { fields.push('description = :description'); params.description = data.description; }

    // Both the field update and permission replacement run in one transaction so
    // a permission failure rolls back the name/description change too — no partial update.
    try {
      await transaction(async (client) => {
        if (fields.length > 0) {
          const result = await client.query<Role>(
            `UPDATE role SET ${fields.join(', ')} WHERE id = :id
             RETURNING id, name, description, "createdAt", "updatedAt"`,
            params
          );
          if (!result.rows[0]) throw new NotFoundError('Role');
        }

        if (data.permissionIds !== undefined) {
          await client.query(`DELETE FROM "rolePermission" WHERE "roleId" = :id`, { id });
          for (const permissionId of data.permissionIds) {
            await client.query(
              `INSERT INTO "rolePermission" ("roleId", "permissionId") VALUES (:id, :permissionId)
               ON CONFLICT ("roleId", "permissionId") DO NOTHING`,
              { id, permissionId }
            );
          }
        }
      });
    } catch (err: unknown) {
      if (isPgError(err)) {
        if (err.code === '23503') throw new ValidationError('One or more permission IDs do not exist');
        if (err.code === '23505') throw new ValidationError('A role with this name already exists');
      }
      throw err;
    }

    const updated = await this.findById(id);
    if (!updated) throw new NotFoundError('Role');
    return updated;
  }

  async delete(id: string): Promise<void> {
    await query(`DELETE FROM role WHERE id = :id`, { id });
  }

  private mapRow(row: RoleQueryRow): RoleWithPermissions {
    const permissions = Array.isArray(row.permissions) ? row.permissions : [];
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      permissions: permissions.filter((p) => p?.id),
    };
  }
}
