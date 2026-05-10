import { AuditLogRepository } from './audit.repository.js';
import { AuditLogService } from './audit.service.js';

/**
 * Module-level singleton so every domain service hits the same audit
 * service instance. Repositories don't carry per-request state, so the
 * single instance is safe across all callers.
 */
export const auditLogService = new AuditLogService(new AuditLogRepository());
