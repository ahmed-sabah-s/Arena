import type { CustomClient } from '../../../db.js';

export type OtpPurpose = 'registration' | 'login' | 'phone_change' | 'password_reset';

export interface OtpRequest {
  id: string;
  phone: string;
  codeHash: string;
  purpose: OtpPurpose;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface CreateOtpRequestInput {
  phone: string;
  codeHash: string;
  purpose: OtpPurpose;
  maxAttempts: number;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface IOtpRepository {
  create(input: CreateOtpRequestInput): Promise<OtpRequest>;
  findActiveByPhone(phone: string, purpose: OtpPurpose): Promise<OtpRequest | null>;
  findByIdForUpdate(id: string, client: CustomClient): Promise<OtpRequest | null>;
  incrementAttempts(id: string, client: CustomClient): Promise<void>;
  markConsumed(id: string, client: CustomClient): Promise<void>;
  countSendsInWindow(phone: string, sinceMinutes: number): Promise<number>;
}
