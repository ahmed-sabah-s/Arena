export interface AuditLog {
  id: string;
  userId?: string;
  action: string;
  resource: string;
  details?: unknown;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}
