import { router, protectedProcedureWithErrorHandling } from '../../presentation/trpc';
import { z } from 'zod';
import {
  CompleteOnboardingInputSchema,
  UpdateProfileInputSchema,
  SetEmailAndPasswordInputSchema,
  ChangePasswordInputSchema,
  RequestPhoneChangeInputSchema,
  VerifyPhoneChangeInputSchema,
} from '@arena/shared';
import { UserService } from './user.service';
import { UserRepository } from './user.repository';
import { RoleRepository } from '../role/role.repository';
import { OtpRepository, OtpService } from '../auth/otp';
import { RefreshTokenRepository } from '../auth/auth.repository';
import { JwtService, PasswordService } from '../../shared/security';

const userRepository = new UserRepository();
const roleRepository = new RoleRepository();
const refreshTokenRepository = new RefreshTokenRepository();
const otpService = new OtpService(new OtpRepository());
const userService = new UserService(
  userRepository,
  roleRepository,
  new PasswordService(),
  otpService,
  new JwtService(),
  refreshTokenRepository,
);

export const userRouter = router({
  getMe: protectedProcedureWithErrorHandling
    .query(async ({ ctx }) => userService.getMe(ctx.user.id)),

  getById: protectedProcedureWithErrorHandling
    .input(z.string().uuid())
    .query(async ({ input, ctx }) => userService.getUserById(input, ctx.user.id)),

  getMany: protectedProcedureWithErrorHandling
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(10),
        search: z.string().optional(),
      }),
    )
    .query(async ({ input, ctx }) =>
      userService.getUsers(input.page, input.limit, input.search, ctx.user.id),
    ),

  // ─── Self-service profile (Phase 2) ───────────────────────────────────────
  completeOnboarding: protectedProcedureWithErrorHandling
    .input(CompleteOnboardingInputSchema)
    .mutation(async ({ ctx, input }) => userService.completeOnboarding(ctx.user.id, input)),

  updateProfile: protectedProcedureWithErrorHandling
    .input(UpdateProfileInputSchema)
    .mutation(async ({ ctx, input }) => userService.updateProfile(ctx.user.id, input)),

  setEmailAndPassword: protectedProcedureWithErrorHandling
    .input(SetEmailAndPasswordInputSchema)
    .mutation(async ({ ctx, input }) => userService.setEmailAndPassword(ctx.user.id, input)),

  changePassword: protectedProcedureWithErrorHandling
    .input(ChangePasswordInputSchema)
    .mutation(async ({ ctx, input }) => {
      await userService.changePassword(ctx.user.id, input);
      return { success: true };
    }),

  requestPhoneChangeOtp: protectedProcedureWithErrorHandling
    .input(RequestPhoneChangeInputSchema)
    .mutation(async ({ ctx, input }) =>
      userService.requestPhoneChangeOtp(ctx.user.id, input.newPhone, {
        ipAddress: ctx.req.ip,
        userAgent: ctx.req.headers['user-agent'],
      }),
    ),

  verifyPhoneChangeOtp: protectedProcedureWithErrorHandling
    .input(VerifyPhoneChangeInputSchema)
    .mutation(async ({ ctx, input }) =>
      userService.verifyPhoneChangeOtp(ctx.user.id, input.newPhone, input.code),
    ),

  // ─── Admin operations (kept from template) ────────────────────────────────
  update: protectedProcedureWithErrorHandling
    .input(
      z.object({
        userId: z.string().uuid(),
        data: z.object({
          fullName: z.string().min(2).optional(),
          avatar: z.string().optional(),
          phone: z.string().optional(),
          isActive: z.boolean().optional(),
        }),
      }),
    )
    .mutation(async ({ input, ctx }) =>
      userService.updateUser(input.userId, input.data, ctx.user.id),
    ),

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
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await userService.assignRoles(input.userId, input.roleIds, ctx.user.id, {
        ipAddress: ctx.req.ip,
        userAgent: ctx.req.headers['user-agent'],
      });
      return { success: true };
    }),
});
