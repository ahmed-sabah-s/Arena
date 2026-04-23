import { z } from 'zod';

export const permissionIdSchema = z.object({
  permissionId: z.string().uuid(),
});

export const createPermissionSchema = z.object({
  name: z.string().min(2).max(100),
  resource: z.string().min(2).max(100),
  action: z.string().min(2).max(50),
  description: z.string().optional(),
});

export const updatePermissionSchema = z.object({
  permissionId: z.string().uuid(),
  name: z.string().min(2).max(100).optional(),
  description: z.string().optional(),
});

export type CreatePermissionInput = z.infer<typeof createPermissionSchema>;
export type UpdatePermissionInput = z.infer<typeof updatePermissionSchema>;
