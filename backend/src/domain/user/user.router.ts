import { router, protectedProcedureWithErrorHandling } from '../../presentation/trpc';
import { z } from 'zod';
import { UserService } from './user.service';
import { UserRepository } from './user.repository';
import { RoleRepository } from '../role/role.repository';

const userRepository = new UserRepository();
const roleRepository = new RoleRepository();
const userService = new UserService(userRepository, roleRepository);

export const userRouter = router({
  getMe: protectedProcedureWithErrorHandling
    .query(async ({ ctx }) => {
      return userService.getMe(ctx.user.id);
    }),

  getById: protectedProcedureWithErrorHandling
    .input(z.string().uuid())
    .query(async ({ input, ctx }) => {
      return userService.getUserById(input, ctx.user.id);
    }),

  getMany: protectedProcedureWithErrorHandling
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(10),
        search: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      return userService.getUsers(input.page, input.limit, input.search, ctx.user.id);
    }),

  update: protectedProcedureWithErrorHandling
    .input(
      z.object({
        userId: z.string().uuid(),
        data: z.object({
          name: z.string().min(2).optional(),
          avatar: z.string().optional(),
          phone: z.string().optional(),
          isActive: z.boolean().optional(),
        }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return userService.updateUser(input.userId, input.data, ctx.user.id);
    }),

  delete: protectedProcedureWithErrorHandling
    .input(z.string().uuid())
    .mutation(async ({ input, ctx }) => {
      await userService.deleteUser(input, ctx.user.id, {
        ipAddress: ctx.req.ip,
        userAgent: ctx.req.headers['user-agent'],
      });
      return { success: true };
    }),

  assignRoles: protectedProcedureWithErrorHandling
    .input(
      z.object({
        userId: z.string().uuid(),
        roleIds: z.array(z.string().uuid()),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await userService.assignRoles(input.userId, input.roleIds, ctx.user.id, {
        ipAddress: ctx.req.ip,
        userAgent: ctx.req.headers['user-agent'],
      });
      return { success: true };
    }),
});
