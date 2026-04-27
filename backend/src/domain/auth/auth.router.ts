import {
  router,
  publicProcedureWithErrorHandling,
  protectedProcedureWithErrorHandling,
} from '../../presentation/trpc';
import { z } from 'zod';
import {
  RequestOtpInputSchema,
  VerifyOtpInputSchema,
  LoginPasswordInputSchema,
  RefreshSessionInputSchema,
  LogoutInputSchema,
  ForgotPasswordInputSchema,
  ResetPasswordInputSchema,
} from '@arena/shared';
import { AuthService } from './auth.service';
import { RefreshTokenRepository } from './auth.repository';
import { OtpRepository, OtpService } from './otp';
import { JwtService, PasswordService, TwoFactorService } from '../../shared/security';
import { EmailService } from '../../shared/service';
import { UserRepository } from '../user';
import {
  loginLimiter,
  registerLimiter,
  passwordResetLimiter,
  refreshTokenLimiter,
} from '../../shared/middleware/rateLimiter';

const userRepository = new UserRepository();
const refreshTokenRepository = new RefreshTokenRepository();
const otpRepository = new OtpRepository();
const otpService = new OtpService(otpRepository);
const jwtService = new JwtService();
const passwordService = new PasswordService();
const twoFactorService = new TwoFactorService();
const emailService = new EmailService();

const authService = new AuthService(
  userRepository,
  refreshTokenRepository,
  jwtService,
  passwordService,
  twoFactorService,
  emailService,
  otpService,
);

const totpToken = z.string().regex(/^\d{6}$/, 'Token must be a 6-digit code');

export const authRouter = router({
  // ── OTP-based phone auth ─────────────────────────────────────────────────
  requestRegistrationOtp: publicProcedureWithErrorHandling
    .input(RequestOtpInputSchema)
    .mutation(async ({ input, ctx }) => {
      registerLimiter.check(ctx.req.ip ?? 'unknown');
      return authService.requestRegistrationOtp({
        phone: input.phone,
        ipAddress: ctx.req.ip,
        userAgent: ctx.req.headers['user-agent'],
      });
    }),

  verifyRegistrationOtp: publicProcedureWithErrorHandling
    .input(VerifyOtpInputSchema)
    .mutation(async ({ input }) => {
      return authService.verifyRegistrationOtp({ phone: input.phone, code: input.code });
    }),

  requestLoginOtp: publicProcedureWithErrorHandling
    .input(RequestOtpInputSchema)
    .mutation(async ({ input, ctx }) => {
      loginLimiter.check(ctx.req.ip ?? 'unknown');
      return authService.requestLoginOtp({
        phone: input.phone,
        ipAddress: ctx.req.ip,
        userAgent: ctx.req.headers['user-agent'],
      });
    }),

  verifyLoginOtp: publicProcedureWithErrorHandling
    .input(VerifyOtpInputSchema)
    .mutation(async ({ input }) => {
      return authService.verifyLoginOtp({ phone: input.phone, code: input.code });
    }),

  // ── Email + password (secondary) ──────────────────────────────────────────
  loginWithPassword: publicProcedureWithErrorHandling
    .input(LoginPasswordInputSchema)
    .mutation(async ({ input, ctx }) => {
      loginLimiter.check(ctx.req.ip ?? 'unknown');
      return authService.loginWithPassword(input.email, input.password, input.twoFactorCode);
    }),

  // ── Session management ───────────────────────────────────────────────────
  refreshSession: publicProcedureWithErrorHandling
    .input(RefreshSessionInputSchema)
    .mutation(async ({ input, ctx }) => {
      refreshTokenLimiter.check(ctx.req.ip ?? 'unknown');
      return authService.refreshSession(input.refreshToken);
    }),

  logout: protectedProcedureWithErrorHandling
    .input(LogoutInputSchema)
    .mutation(async ({ input }) => authService.logout(input.refreshToken)),

  logoutAll: protectedProcedureWithErrorHandling
    .mutation(async ({ ctx }) => authService.logoutAll(ctx.user.id)),

  // ── Forgot / reset password (email) ──────────────────────────────────────
  forgotPassword: publicProcedureWithErrorHandling
    .input(ForgotPasswordInputSchema)
    .mutation(async ({ input, ctx }) => {
      passwordResetLimiter.check(ctx.req.ip ?? 'unknown');
      await authService.forgotPassword(input.email);
      return { success: true };
    }),

  resetPassword: publicProcedureWithErrorHandling
    .input(ResetPasswordInputSchema)
    .mutation(async ({ input, ctx }) => {
      passwordResetLimiter.check(ctx.req.ip ?? 'unknown');
      await authService.resetPassword(input.token, input.newPassword);
      return { success: true };
    }),

  // ── 2FA ───────────────────────────────────────────────────────────────────
  enable2FA: protectedProcedureWithErrorHandling
    .mutation(async ({ ctx }) => authService.enable2FA(ctx.user.id)),

  verify2FA: protectedProcedureWithErrorHandling
    .input(z.object({ token: totpToken }))
    .mutation(async ({ ctx, input }) => {
      await authService.verify2FA(ctx.user.id, input.token);
      return { success: true };
    }),

  disable2FA: protectedProcedureWithErrorHandling
    .input(z.object({ token: totpToken }))
    .mutation(async ({ ctx, input }) => {
      await authService.disable2FA(ctx.user.id, input.token);
      return { success: true };
    }),
});
