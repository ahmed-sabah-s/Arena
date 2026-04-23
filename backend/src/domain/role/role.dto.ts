import { z } from 'zod';

export const RoleDTOSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  permissions: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      resource: z.string(),
      action: z.string(),
    })
  ),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type RoleDTO = z.infer<typeof RoleDTOSchema>;

export const CreateRoleDTOSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  permissionIds: z.array(z.string()).optional(),
});

export type CreateRoleDTO = z.infer<typeof CreateRoleDTOSchema>;

export const UpdateRoleDTOSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  permissionIds: z.array(z.string()).optional(),
});

export type UpdateRoleDTO = z.infer<typeof UpdateRoleDTOSchema>;
