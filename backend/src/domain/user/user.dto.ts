import { z } from 'zod';

export const UserDTOSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  avatar: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  isActive: z.boolean(),
  emailVerified: z.boolean(),
  twoFactorEnabled: z.boolean(),
  roles: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      permissions: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          resource: z.string(),
          action: z.string(),
        })
      ),
    })
  ),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type UserDTO = z.infer<typeof UserDTOSchema>;

export const CreateUserDTOSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
  phone: z.string().optional(),
});

export type CreateUserDTO = z.infer<typeof CreateUserDTOSchema>;

export const UpdateUserDTOSchema = z.object({
  name: z.string().min(2).optional(),
  avatar: z.string().optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateUserDTO = z.infer<typeof UpdateUserDTOSchema>;
