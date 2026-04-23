import { router, protectedProcedureWithErrorHandling } from '../../presentation/trpc';
import { z } from 'zod';
import { FileService } from './file.service';
import { FileRepository } from './file.repository';
import { UserRepository } from '../user/user.repository';
import { S3Service } from '../../shared/service';

const fileRepository = new FileRepository();
const userRepository = new UserRepository();
const s3Service = new S3Service();
const fileService = new FileService(fileRepository, userRepository, s3Service);

export const fileRouter = router({
  getUploadUrl: protectedProcedureWithErrorHandling
    .input(
      z.object({
        mimeType: z.string().min(1),
        sizeBytes: z.number().int().positive().max(50 * 1024 * 1024),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return fileService.requestUploadUrl(input.mimeType, input.sizeBytes, ctx.user.id);
    }),

  confirmUpload: protectedProcedureWithErrorHandling
    .input(
      z.object({
        key: z.string().min(1),
        mimeType: z.string().min(1),
        sizeBytes: z.number().int().positive().max(50 * 1024 * 1024),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return fileService.confirmUpload(input.key, input.mimeType, input.sizeBytes, ctx.user.id);
    }),

  getPresignedUrl: protectedProcedureWithErrorHandling
    .input(
      z.object({
        key: z.string().min(1),
        expiresIn: z.number().int().min(60).max(3600).default(900),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const url = await fileService.getPresignedUrl(input.key, input.expiresIn, ctx.user.id);
      return { url };
    }),

  delete: protectedProcedureWithErrorHandling
    .input(z.object({ key: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      await fileService.deleteFile(input.key, ctx.user.id);
      return { success: true };
    }),
});
