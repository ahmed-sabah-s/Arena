import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string(),

  // JWT
  JWT_SECRET: z.string(),
  JWT_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_SECRET: z.string(),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),

  // AWS S3
  AWS_REGION: z.string().default("us-east-1"),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),

  // SMTP
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().transform(Number).default(587),
  SMTP_SECURE: z
    .string()
    .transform((v) => v === "true")
    .default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  // OTP Service
  OTP_SERVICE_URL: z.string().optional(),
  OTP_SERVICE_ACCOUNT_SID: z.string().optional(),
  OTP_SERVICE_AUTH_TOKEN: z.string().optional(),
  OTP_SERVICE_PHONE: z.string().optional(),

  // App
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.string().transform(Number).default(3000),
  FRONTEND_URL: z.string().default("http://localhost:5173"),

  // Security
  BCRYPT_ROUNDS: z.string().transform(Number).default(10),
  MAX_LOGIN_ATTEMPTS: z.string().transform(Number).default(5),
  LOGIN_ATTEMPTS_WINDOW: z.string().default("15m"),
});

export const config = envSchema.parse(process.env);

export type Config = z.infer<typeof envSchema>;
