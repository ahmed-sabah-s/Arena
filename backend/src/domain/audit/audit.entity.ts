export interface AuditLog {
  id: string;
  userId?: string;
  action: string;
  resource: string;
  details?: any;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}
