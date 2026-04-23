import { router, protectedProcedureWithErrorHandling } from '../../presentation/trpc';
import { z } from 'zod';
import { PermissionService } from './permission.service';
import { PermissionRepository } from './permission.repository';
import { UserRepository } from '../user';

const permissionRepository = new PermissionRepository();
const userRepository = new UserRepository();
const permissionService = new PermissionService(permissionRepository, userRepository);

export const permissionRouter = router({
  getAll: protectedProcedureWithErrorHandling
    .query(async ({ ctx }) => {
      return permissionService.getPermissions(ctx.user.id);
    }),

  create: protectedProcedureWithErrorHandling
    .input(
      z.object({
        name: z.string().min(2),
        resource: z.string().min(2),
        action: z.string().min(2),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return permissionService.createPermission(input, ctx.user.id, {
        ipAddress: ctx.req.ip,
        userAgent: ctx.req.headers['user-agent'],
      });
    }),
});
