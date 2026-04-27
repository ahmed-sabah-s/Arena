import { AuditLog } from './audit.entity';

export interface IAuditLogRepository {
  create(data: {
    userId?: string;
    action: string;
    resource: string;
    details?: unknown;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<AuditLog>;
  findMany(options: {
    skip?: number;
    take?: number;
    userId?: string;
    action?: string;
    resource?: string;
  }): Promise<{ logs: AuditLog[]; total: number }>;
}
