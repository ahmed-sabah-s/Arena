import { z } from 'zod';

export const NotificationDeliveryStatusSchema = z.enum([
  'pending',
  'sent',
  'failed',
  'cancelled',
]);
export type NotificationDeliveryStatus = z.infer<typeof NotificationDeliveryStatusSchema>;

export const NotificationSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  type: z.string().max(50),
  payload: z.unknown(),
  deliveryStatus: NotificationDeliveryStatusSchema,
  scheduledFor: z.coerce.date(),
  sentAt: z.coerce.date().nullable(),
  readAt: z.coerce.date().nullable(),
  errorMessage: z.string().nullable(),
  retryCount: z.number().int().nonnegative(),
  createdAt: z.coerce.date(),
});
export type Notification = z.infer<typeof NotificationSchema>;

export const MarkNotificationReadInputSchema = z.object({
  notificationId: z.string().uuid(),
});
export type MarkNotificationReadInput = z.infer<typeof MarkNotificationReadInputSchema>;
