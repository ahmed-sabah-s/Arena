import { z } from 'zod';

export const roleIdSchema = z.object({
  roleId: z.string().uuid(),
});

export const createRoleSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().optional(),
});

export const updateRoleSchema = z.object({
  roleId: z.string().uuid(),
  name: z.string().min(2).max(100).optional(),
  description: z.string().optional(),
});

export const assignRoleSchema = z.object({
  userId: z.string().uuid(),
  roleId: z.string().uuid(),
});

export const assignPermissionToRoleSchema = z.object({
  roleId: z.string().uuid(),
  permissionId: z.string().uuid(),
});

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type AssignRoleInput = z.infer<typeof assignRoleSchema>;
