import { router, protectedProcedureWithErrorHandling } from '../../presentation/trpc';
import { z } from 'zod';
import { RoleService } from './role.service';
import { RoleRepository } from './role.repository';
import { UserRepository } from '../user';

const roleRepository = new RoleRepository();
const userRepository = new UserRepository();
const roleService = new RoleService(roleRepository, userRepository);

export const roleRouter = router({
  getAll: protectedProcedureWithErrorHandling
    .query(async ({ ctx }) => {
      return roleService.getRoles(ctx.user.id);
    }),

  getById: protectedProcedureWithErrorHandling
    .input(z.string().uuid())
    .query(async ({ input, ctx }) => {
      return roleService.getRoleById(input, ctx.user.id);
    }),

  create: protectedProcedureWithErrorHandling
    .input(
      z.object({
        name: z.string().min(2),
        description: z.string().optional(),
        permissionIds: z.array(z.string().uuid()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return roleService.createRole(input, ctx.user.id);
    }),

  update: protectedProcedureWithErrorHandling
    .input(
      z.object({
        roleId: z.string().uuid(),
        data: z.object({
          name: z.string().min(2).optional(),
          description: z.string().optional(),
          permissionIds: z.array(z.string().uuid()).optional(),
        }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return roleService.updateRole(input.roleId, input.data, ctx.user.id);
    }),

  delete: protectedProcedureWithErrorHandling
    .input(z.string().uuid())
    .mutation(async ({ input, ctx }) => {
      await roleService.deleteRole(input, ctx.user.id);
      return { success: true };
    }),
});
