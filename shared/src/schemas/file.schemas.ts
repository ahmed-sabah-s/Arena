import { z } from 'zod';

export const uploadFileSchema = z.object({
  fileName: z.string(),
  fileType: z.string(),
  size: z.number().positive(),
});

export const deleteFileSchema = z.object({
  fileId: z.string().uuid(),
});

export type UploadFileInput = z.infer<typeof uploadFileSchema>;
export type DeleteFileInput = z.infer<typeof deleteFileSchema>;
