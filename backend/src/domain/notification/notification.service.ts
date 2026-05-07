import type { CustomClient } from '../../db.js';
import type { INotificationRepository, CreateNotificationData } from './notification.interface.js';
import type { Notification } from './notification.entity.js';

const DEFAULT_LIST_LIMIT = 50;

export class NotificationService {
  constructor(private readonly repo: INotificationRepository) {}

  /**
   * Enqueue a notification. Phase 5 always inserts as `pending`; Phase 8's
   * delivery worker picks up pending rows and pushes them.
   * The optional `client` lets a caller include the enqueue in their own
   * transaction (e.g., enqueue match_found inside the match-creation tx).
   */
  async enqueue(input: CreateNotificationData, client?: CustomClient): Promise<Notification> {
    return this.repo.create(input, client);
  }

  async getMyUnread(userId: string, limit = DEFAULT_LIST_LIMIT): Promise<Notification[]> {
    return this.repo.findUnreadForUser(userId, limit);
  }

  async getMyRecent(userId: string, limit = DEFAULT_LIST_LIMIT): Promise<Notification[]> {
    return this.repo.findRecentForUser(userId, limit);
  }

  async markAsRead(notificationId: string, userId: string): Promise<{ marked: boolean }> {
    const marked = await this.repo.markRead(notificationId, userId);
    return { marked };
  }

  async markAllAsRead(userId: string): Promise<{ count: number }> {
    const count = await this.repo.markAllRead(userId);
    return { count };
  }
}
