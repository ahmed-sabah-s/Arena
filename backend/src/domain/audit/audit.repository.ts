import { query } from '../../db';
import { IAuditLogRepository } from './audit.interface';
import { AuditLog } from './audit.entity';
import { AppError } from '../../shared/errors';

export class AuditLogRepository implements IAuditLogRepository {
  async create(data: {
    userId?: string;
    action: string;
    resource: string;
    details?: any;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<AuditLog> {
    const [row] = await query<AuditLog>(
      `INSERT INTO "auditLog" ("userId", action, resource, details, "ipAddress", "userAgent")
       VALUES (:userId, :action, :resource, :details, :ipAddress, :userAgent) RETURNING *`,
      {
        userId: data.userId ?? null,
        action: data.action,
        resource: data.resource,
        details: data.details ? JSON.stringify(data.details) : null,
        ipAddress: data.ipAddress ?? null,
        userAgent: data.userAgent ?? null,
      }
    );
    if (!row) throw new AppError('Failed to create audit log', 500);
    return row;
  }

  async findMany(options: {
    skip?: number;
    take?: number;
    userId?: string;
    action?: string;
    resource?: string;
  }): Promise<{ logs: AuditLog[]; total: number }> {
    const { skip = 0, take = 50, userId, action, resource } = options;
    const cappedTake = Math.min(take, 200);

    const conditions: string[] = [];
    const params: Record<string, any> = { take, skip };

    if (userId) { conditions.push('"userId" = :userId'); params.userId = userId; }
    if (action) { conditions.push('action = :action'); params.action = action; }
    if (resource) { conditions.push('resource = :resource'); params.resource = resource; }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    params.take = cappedTake;
    const logs = await query<AuditLog>(
      `SELECT * FROM "auditLog" ${where} ORDER BY "createdAt" DESC LIMIT :take OFFSET :skip`,
      params
    );

    const countParams = Object.fromEntries(
      Object.entries(params).filter(([k]) => k !== 'take' && k !== 'skip')
    );
    const [countRow] = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM "auditLog" ${where}`,
      Object.keys(countParams).length > 0 ? countParams : undefined
    );

    return { logs, total: parseInt(countRow?.count || '0', 10) };
  }
}
