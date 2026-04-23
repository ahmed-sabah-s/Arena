import { query, transaction } from '../../db';
import { IUserRepository } from './user.interface';
import { User, UserWithRoles } from './user.entity';
import { AppError, NotFoundError, ConflictError } from '../../shared/errors';

const rolesQuery = `
  SELECT r.id, r.name,
    COALESCE(
      json_agg(
        json_build_object('id', p.id, 'name', p.name, 'resource', p.resource, 'action', p.action)
      ) FILTER (WHERE p.id IS NOT NULL),
      '[]'::json
    ) as permissions
  FROM role r
  INNER JOIN "userRole" ur ON r.id = ur."roleId"
  LEFT JOIN "rolePermission" rp ON r.id = rp."roleId"
  LEFT JOIN permission p ON rp."permissionId" = p.id
  WHERE ur."userId" = :userId
  GROUP BY r.id, r.name
`;

export class UserRepository implements IUserRepository {
  async findById(id: string): Promise<UserWithRoles | null> {
    const [user] = await query<User>(`SELECT * FROM "user" WHERE id = :id`, { id });
    if (!user) return null;
    const roles = await query<any>(rolesQuery, { userId: id });
    return { ...user, roles };
  }

  async findByEmail(email: string): Promise<UserWithRoles | null> {
    const [user] = await query<User>(`SELECT * FROM "user" WHERE email = :email`, { email });
    if (!user) return null;
    const roles = await query<any>(rolesQuery, { userId: user.id });
    return { ...user, roles };
  }

  async findMany(options: {
    skip?: number;
    take?: number;
    search?: string;
  }): Promise<{ users: UserWithRoles[]; total: number }> {
    const { skip = 0, take = 10, search } = options;

    const cappedTake = Math.min(take, 100);
    const where = search ? 'WHERE name ILIKE :search OR email ILIKE :search' : '';
    const escapedSearch = search?.replace(/[%_\\]/g, (c) => `\\${c}`);
    const params: Record<string, any> = { skip, take: cappedTake };
    if (escapedSearch) params.search = `%${escapedSearch}%`;

    const users = await query<User>(
      `SELECT * FROM "user" ${where} ORDER BY "createdAt" DESC LIMIT :take OFFSET :skip`,
      params
    );

    const countParams = search ? { search: params.search } : undefined;
    const [countRow] = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM "user" ${where}`,
      countParams
    );
    const total = parseInt(countRow?.count || '0', 10);

    const usersWithRoles = await Promise.all(
      users.map(async (user) => {
        const roles = await query<any>(rolesQuery, { userId: user.id });
        return { ...user, roles };
      })
    );

    return { users: usersWithRoles, total };
  }

  async create(data: {
    email: string;
    password: string;
    name: string;
    phone?: string;
  }): Promise<User> {
    try {
      const [row] = await query<User>(
        `INSERT INTO "user" (email, password, name, phone)
         VALUES (:email, :password, :name, :phone)
         RETURNING *`,
        { email: data.email, password: data.password, name: data.name, phone: data.phone ?? null }
      );
      if (!row) throw new AppError('Failed to create user', 500);
      return row;
    } catch (err: any) {
      if (err.code === '23505') throw new ConflictError('A user with this email already exists');
      throw err;
    }
  }

  private static readonly UPDATABLE_COLUMNS = new Set([
    'name', 'password', 'avatar', 'phone',
    'isActive', 'emailVerified', 'emailVerifiedAt',
    'twoFactorSecret', 'twoFactorEnabled', 'lastLoginAt',
  ]);

  async update(id: string, data: Partial<User>): Promise<User> {
    const fields: string[] = [];
    const params: Record<string, any> = { id };

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && key !== 'id' && UserRepository.UPDATABLE_COLUMNS.has(key)) {
        fields.push(`"${key}" = :${key}`);
        params[key] = value;
      }
    }

    if (fields.length === 0) {
      const [existing] = await query<User>(`SELECT * FROM "user" WHERE id = :id`, { id });
      if (!existing) throw new NotFoundError('User');
      return existing;
    }

    const [row] = await query<User>(
      `UPDATE "user" SET ${fields.join(', ')} WHERE id = :id RETURNING *`,
      params
    );
    if (!row) throw new NotFoundError('User');
    return row;
  }

  async delete(id: string): Promise<void> {
    await query(`DELETE FROM "user" WHERE id = :id`, { id });
  }

  async assignRoles(userId: string, roleIds: string[]): Promise<void> {
    await transaction(async (client) => {
      await client.query(`DELETE FROM "userRole" WHERE "userId" = :userId`, { userId });
      for (const roleId of roleIds) {
        await client.query(
          `INSERT INTO "userRole" ("userId", "roleId") VALUES (:userId, :roleId)
           ON CONFLICT ("userId", "roleId") DO NOTHING`,
          { userId, roleId }
        );
      }
    });
  }

  async removeRoles(userId: string, roleIds: string[]): Promise<void> {
    for (const roleId of roleIds) {
      await query(
        `DELETE FROM "userRole" WHERE "userId" = :userId AND "roleId" = :roleId`,
        { userId, roleId }
      );
    }
  }

  async hasPermission(userId: string, resource: string, action: string): Promise<boolean> {
    const [row] = await query<{ exists: boolean }>(
      `SELECT EXISTS(
        SELECT 1 FROM permission p
        INNER JOIN "rolePermission" rp ON p.id = rp."permissionId"
        INNER JOIN "userRole" ur ON rp."roleId" = ur."roleId"
        WHERE ur."userId" = :userId
        AND p.resource = :resource
        AND p.action = :action
      ) as exists`,
      { userId, resource, action }
    );
    return row?.exists || false;
  }
}
