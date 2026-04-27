import { z } from 'zod';

export const ConfigValueTypeSchema = z.enum(['string', 'number', 'integer', 'boolean', 'array', 'object']);
export type ConfigValueType = z.infer<typeof ConfigValueTypeSchema>;

export const PlatformConfigSchema = z.object({
  key: z.string().max(100),
  value: z.unknown(),
  valueType: ConfigValueTypeSchema,
  description: z.string().nullable(),
  category: z.string().max(50),
  updatedBy: z.string().uuid().nullable(),
  updatedAt: z.coerce.date(),
  createdAt: z.coerce.date(),
});
export type PlatformConfig = z.infer<typeof PlatformConfigSchema>;
