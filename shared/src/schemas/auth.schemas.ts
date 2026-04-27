import { z } from 'zod';

// Permissive international format: + followed by 8–15 digits.
// Country-specific tightening can come later when we know exact target markets.
const phoneRegex = /^\+\d{8,15}$/;
export const PhoneSchema = z.string().regex(phoneRegex, 'Phone must be international format like +9647500000000');

export const OtpCodeSchema = z.string().regex(/^\d{4,8}$/, 'OTP must be 4-8 digits');

// ─── OTP-based phone auth ─────────────────────────────────────────────────────

export const RequestOtpInputSchema = z.object({
  phone: PhoneSchema,
});
export type RequestOtpInput = z.infer<typeof RequestOtpInputSchema>;

export const VerifyOtpInputSchema = z.object({
  phone: PhoneSchema,
  code: OtpCodeSchema,
});
export type VerifyOtpInput = z.infer<typeof VerifyOtpInputSchema>;

export const AuthOtpResponseSchema = z.object({
  requestId: z.string().uuid(),
  expiresAt: z.coerce.date(),
});
export type AuthOtpResponse = z.infer<typeof AuthOtpResponseSchema>;

// ─── Email + password (legacy convenience) ───────────────────────────────────

export const LoginPasswordInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
  twoFactorCode: z.string().regex(/^\d{6}$/).optional(),
});
export type LoginPasswordInput = z.infer<typeof LoginPasswordInputSchema>;

// ─── Refresh / logout ────────────────────────────────────────────────────────

export const RefreshSessionInputSchema = z.object({
  refreshToken: z.string(),
});
export type RefreshSessionInput = z.infer<typeof RefreshSessionInputSchema>;

export const LogoutInputSchema = z.object({
  refreshToken: z.string(),
});
export type LogoutInput = z.infer<typeof LogoutInputSchema>;

// ─── Forgot / reset password (email-based) ───────────────────────────────────

export const ForgotPasswordInputSchema = z.object({
  email: z.string().email(),
});
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordInputSchema>;

export const ResetPasswordInputSchema = z.object({
  token: z.string(),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[a-z]/, 'Password must contain a lowercase letter')
    .regex(/[0-9]/, 'Password must contain a number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain a special character'),
});
export type ResetPasswordInput = z.infer<typeof ResetPasswordInputSchema>;

// ─── Backwards-compatible aliases (existing code may still import these) ────

export const loginSchema = LoginPasswordInputSchema;
export const refreshTokenSchema = RefreshSessionInputSchema;
export const resetPasswordRequestSchema = ForgotPasswordInputSchema;
export const resetPasswordSchema = ResetPasswordInputSchema;
export const enable2FASchema = z.object({ userId: z.string().uuid() });
export const verify2FASchema = z.object({
  userId: z.string().uuid(),
  token: z.string().length(6),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type ResetPasswordRequestInput = z.infer<typeof resetPasswordRequestSchema>;
