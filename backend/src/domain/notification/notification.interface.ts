import type { CustomClient } from '../../db.js';
import type { Notification } from './notification.entity.js';

export interface CreateNotificationData {
  userId: string;
  type: string;
  payload: unknown;
  scheduledFor?: Date;
}

export interface INotificationRepository {
  create(input: CreateNotificationData, client?: CustomClient): Promise<Notification>;
  findById(id: string): Promise<Notification | null>;
  findUnreadForUser(userId: string, limit: number): Promise<Notification[]>;
  findRecentForUser(userId: string, limit: number): Promise<Notification[]>;
  markRead(id: string, userId: string): Promise<boolean>;
  markAllRead(userId: string): Promise<number>;
}
