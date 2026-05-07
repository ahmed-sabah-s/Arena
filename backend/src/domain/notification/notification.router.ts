import { z } from 'zod';
import {
  router,
  protectedProcedureWithErrorHandling,
} from '../../presentation/trpc';
import { MarkNotificationReadInputSchema } from '@arena/shared';
import { NotificationRepository } from './notification.repository.js';
import { NotificationService } from './notification.service.js';

const repo = new NotificationRepository();
const service = new NotificationService(repo);

export const notificationRouter = router({
  getMyUnread: protectedProcedureWithErrorHandling
    .input(z.object({ limit: z.number().int().min(1).max(200).optional() }).optional())
    .query(async ({ ctx, input }) => service.getMyUnread(ctx.user.id, input?.limit)),

  getMyRecent: protectedProcedureWithErrorHandling
    .input(z.object({ limit: z.number().int().min(1).max(200).optional() }).optional())
    .query(async ({ ctx, input }) => service.getMyRecent(ctx.user.id, input?.limit)),

  markRead: protectedProcedureWithErrorHandling
    .input(MarkNotificationReadInputSchema)
    .mutation(async ({ ctx, input }) =>
      service.markAsRead(input.notificationId, ctx.user.id),
    ),

  markAllRead: protectedProcedureWithErrorHandling
    .mutation(async ({ ctx }) => service.markAllAsRead(ctx.user.id)),
});

// Exported for other domains to instantiate when they need to enqueue.
export { service as notificationService };
