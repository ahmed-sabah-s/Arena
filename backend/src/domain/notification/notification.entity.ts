export type NotificationDeliveryStatus = 'pending' | 'sent' | 'failed' | 'cancelled';

export interface Notification {
  id: string;
  userId: string;
  type: string;
  payload: unknown;
  deliveryStatus: NotificationDeliveryStatus;
  scheduledFor: Date;
  sentAt: Date | null;
  readAt: Date | null;
  errorMessage: string | null;
  retryCount: number;
  createdAt: Date;
}
