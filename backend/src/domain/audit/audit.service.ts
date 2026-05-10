import type { CustomClient } from '../../db.js';
import type { IAuditLogRepository } from './audit.interface.js';

export interface RecordAdminActionInput {
  adminUserId: string;
  action: string;
  resource: string;
  resourceId: string;
  beforeState?: unknown;
  afterState?: unknown;
  notes?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Phase 8 audit-logging surface for admin mutations. The auditLog table
 * already exists from the template baseline; this service is the canonical
 * recordAdminAction entrypoint that every admin service method calls
 * after its mutation.
 *
 * The "details" JSONB column packs the before/after state, the action
 * verb, and free-form notes. We deliberately don't add columns to auditLog
 * for these — the JSONB shape evolves as audited actions evolve, and
 * admin-dashboard queries can filter on action / resource and project the
 * details.
 */
export class AuditLogService {
  constructor(private readonly repo: IAuditLogRepository) {}

  async recordAdminAction(input: RecordAdminActionInput, _client?: CustomClient): Promise<void> {
    // The existing repository.create accepts an unknown details payload and
    // stringifies it on insert. We don't pass the client here because audit
    // rows should commit even if the admin mutation's downstream
    // notifications fail — but they MUST NOT commit before the mutation
    // does. Callers run recordAdminAction after their transaction
    // resolves, not inside it.
    await this.repo.create({
      userId: input.adminUserId,
      action: input.action,
      resource: input.resource,
      details: {
        resourceId: input.resourceId,
        beforeState: input.beforeState ?? null,
        afterState: input.afterState ?? null,
        notes: input.notes ?? null,
      },
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
  }
}
