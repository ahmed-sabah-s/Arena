import {
  router,
  publicProcedureWithErrorHandling,
  protectedProcedureWithErrorHandling,
} from '../../presentation/trpc';
import { z } from 'zod';
import { AuthService } from './auth.service';
import { RefreshTokenRepository } from './auth.repository';
import { JwtService, PasswordService, TwoFactorService } from '../../shared/security';
import { EmailService } from '../../shared/service';
import { UserRepository } from '../user';
import { loginLimiter, registerLimiter, passwordResetLimiter, refreshTokenLimiter } from '../../shared/middleware/rateLimiter';

const userRepository = new UserRepository();
const refreshTokenRepository = new RefreshTokenRepository();
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
  emailService
);

const totpToken = z.string().regex(/^\d{6}$/, 'Token must be a 6-digit code');

export const authRouter = router({
  register: publicProcedureWithErrorHandling
    .input(
      z.object({
        email: z.string().email(),
        password: z
          .string()
          .min(8, 'Password must be at least 8 characters')
          .regex(/[A-Z]/, 'Password must contain an uppercase letter')
          .regex(/[a-z]/, 'Password must contain a lowercase letter')
          .regex(/[0-9]/, 'Password must contain a number')
          .regex(/[^A-Za-z0-9]/, 'Password must contain a special character'),
        name: z.string().min(2),
      })
    )
    .mutation(async ({ input, ctx }) => {
      registerLimiter.check(ctx.req.ip ?? 'unknown');
      return authService.register(input.email, input.password, input.name);
    }),

  login: publicProcedureWithErrorHandling
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(1, 'Password is required'),
        twoFactorCode: totpToken.optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      loginLimiter.check(ctx.req.ip ?? 'unknown');
      return authService.login(input.email, input.password, input.twoFactorCode, {
        ipAddress: ctx.req.ip,
        userAgent: ctx.req.headers['user-agent'],
      });
    }),

  refreshToken: publicProcedureWithErrorHandling
    .input(z.object({ refreshToken: z.string() }))
    .mutation(async ({ input, ctx }) => {
      refreshTokenLimiter.check(ctx.req.ip ?? 'unknown');
      return authService.refreshAccessToken(input.refreshToken);
    }),

  logout: protectedProcedureWithErrorHandling
    .input(z.object({ refreshToken: z.string() }))
    .mutation(async ({ input }) => {
      return authService.logout(input.refreshToken);
    }),

  forgotPassword: publicProcedureWithErrorHandling
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input, ctx }) => {
      passwordResetLimiter.check(ctx.req.ip ?? 'unknown');
      await authService.forgotPassword(input.email);
      return { success: true };
    }),

  resetPassword: publicProcedureWithErrorHandling
    .input(
      z.object({
        token: z.string(),
        newPassword: z
          .string()
          .min(8, 'Password must be at least 8 characters')
          .regex(/[A-Z]/, 'Password must contain an uppercase letter')
          .regex(/[a-z]/, 'Password must contain a lowercase letter')
          .regex(/[0-9]/, 'Password must contain a number')
          .regex(/[^A-Za-z0-9]/, 'Password must contain a special character'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      passwordResetLimiter.check(ctx.req.ip ?? 'unknown');
      await authService.resetPassword(input.token, input.newPassword, {
        ipAddress: ctx.req.ip,
        userAgent: ctx.req.headers['user-agent'],
      });
      return { success: true };
    }),

  enable2FA: protectedProcedureWithErrorHandling
    .mutation(async ({ ctx }) => {
      return authService.enable2FA(ctx.user.id);
    }),

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
