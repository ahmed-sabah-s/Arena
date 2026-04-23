import { z } from 'zod';

export const LoginDTOSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  twoFactorCode: z.string().optional(),
});

export type LoginDTO = z.infer<typeof LoginDTOSchema>;

export const RegisterDTOSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
});

export type RegisterDTO = z.infer<typeof RegisterDTOSchema>;

export const RefreshTokenDTOSchema = z.object({
  refreshToken: z.string(),
});

export type RefreshTokenDTO = z.infer<typeof RefreshTokenDTOSchema>;

export const ForgotPasswordDTOSchema = z.object({
  email: z.string().email(),
});

export type ForgotPasswordDTO = z.infer<typeof ForgotPasswordDTOSchema>;

export const ResetPasswordDTOSchema = z.object({
  token: z.string(),
  newPassword: z.string().min(8),
});

export type ResetPasswordDTO = z.infer<typeof ResetPasswordDTOSchema>;

export const RequestOTPDTOSchema = z.object({
  phone: z.string(),
});

export type RequestOTPDTO = z.infer<typeof RequestOTPDTOSchema>;

export const VerifyOTPDTOSchema = z.object({
  phone: z.string(),
  otp: z.string(),
});

export type VerifyOTPDTO = z.infer<typeof VerifyOTPDTOSchema>;
