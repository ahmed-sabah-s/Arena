import { z } from 'zod';

export const PermissionDTOSchema = z.object({
  id: z.string(),
  name: z.string(),
  resource: z.string(),
  action: z.string(),
  description: z.string().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type PermissionDTO = z.infer<typeof PermissionDTOSchema>;

export const CreatePermissionDTOSchema = z.object({
  name: z.string().min(2),
  resource: z.string().min(2),
  action: z.string().min(2),
  description: z.string().optional(),
});

export type CreatePermissionDTO = z.infer<typeof CreatePermissionDTOSchema>;
