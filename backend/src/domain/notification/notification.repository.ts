import { query } from '../../db.js';
import type { CustomClient } from '../../db.js';
import { AppError } from '../../shared/errors/index.js';
import type {
  CreateNotificationData,
  INotificationRepository,
} from './notification.interface.js';
import type { Notification } from './notification.entity.js';

export class NotificationRepository implements INotificationRepository {
  async create(input: CreateNotificationData, client?: CustomClient): Promise<Notification> {
    const sql = `
      INSERT INTO notifications ("userId", type, payload, "scheduledFor")
      VALUES (:userId, :type, :payload, COALESCE(:scheduledFor, CURRENT_TIMESTAMP))
      RETURNING *`;
    const params = {
      userId: input.userId,
      type: input.type,
      payload: JSON.stringify(input.payload ?? null),
      scheduledFor: input.scheduledFor ?? null,
    };

    if (client) {
      const res = await client.query<Notification>(sql, params);
      const row = res.rows[0];
      if (!row) throw new AppError('Failed to create notification', 500);
      return row;
    }
    const rows = await query<Notification>(sql, params);
    if (!rows[0]) throw new AppError('Failed to create notification', 500);
    return rows[0];
  }

  async findById(id: string): Promise<Notification | null> {
    const [row] = await query<Notification>(
      `SELECT * FROM notifications WHERE id = :id`,
      { id },
    );
    return row ?? null;
  }

  async findUnreadForUser(userId: string, limit: number): Promise<Notification[]> {
    return query<Notification>(
      `SELECT * FROM notifications
       WHERE "userId" = :userId AND "readAt" IS NULL
       ORDER BY "createdAt" DESC
       LIMIT :limit`,
      { userId, limit },
    );
  }

  async findRecentForUser(userId: string, limit: number): Promise<Notification[]> {
    return query<Notification>(
      `SELECT * FROM notifications
       WHERE "userId" = :userId
       ORDER BY "createdAt" DESC
       LIMIT :limit`,
      { userId, limit },
    );
  }

  // Returns true if the row was found and updated. The userId guard ensures a
  // user cannot mark another user's notifications as read.
  async markRead(id: string, userId: string): Promise<boolean> {
    const rows = await query<{ id: string }>(
      `UPDATE notifications
       SET "readAt" = CURRENT_TIMESTAMP
       WHERE id = :id AND "userId" = :userId AND "readAt" IS NULL
       RETURNING id`,
      { id, userId },
    );
    return rows.length > 0;
  }

  async markAllRead(userId: string): Promise<number> {
    const rows = await query<{ id: string }>(
      `UPDATE notifications
       SET "readAt" = CURRENT_TIMESTAMP
       WHERE "userId" = :userId AND "readAt" IS NULL
       RETURNING id`,
      { userId },
    );
    return rows.length;
  }
}
