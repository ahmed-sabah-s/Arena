import { createHash, randomInt } from 'crypto';
import { transaction } from '../../../db.js';
import { AppError } from '../../../shared/errors/index.js';
import {
  getConfigInteger,
} from '../../../shared/config/platformConfig/index.js';
import { getSmsProvider } from '../../../infrastructure/sms/index.js';
import type { SmsProvider } from '../../../infrastructure/sms/index.js';
import type { IOtpRepository, OtpPurpose } from './IOtpRepository.js';

interface SendInput {
  phone: string;
  purpose: OtpPurpose;
  ipAddress?: string;
  userAgent?: string;
}

interface VerifyInput {
  phone: string;
  code: string;
  purpose: OtpPurpose;
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function buildCode(length: number): string {
  // Cryptographic-quality numeric code, padded with leading zeros if needed.
  const max = 10 ** length;
  return randomInt(0, max).toString().padStart(length, '0');
}

export class OtpService {
  constructor(
    private readonly repo: IOtpRepository,
    private readonly smsProvider: SmsProvider = getSmsProvider(),
  ) {}

  async send(input: SendInput): Promise<{ requestId: string; expiresAt: Date }> {
    const [maxSendsPerHour, expiryMinutes, maxVerifyAttempts, codeLength] = await Promise.all([
      getConfigInteger('otp_max_sends_per_hour'),
      getConfigInteger('otp_expiry_minutes'),
      getConfigInteger('otp_max_verify_attempts'),
      getConfigInteger('otp_code_length'),
    ]);

    const sendsInLastHour = await this.repo.countSendsInWindow(input.phone, 60);
    if (sendsInLastHour >= maxSendsPerHour) {
      throw new AppError('Too many OTP requests. Please wait before trying again.', 429, 'OTP_RATE_LIMITED');
    }

    // Test_pair short-circuit: forces a known code for the configured test phone
    let code: string;
    if (process.env.OTP_MODE === 'test_pair' && input.phone === process.env.OTP_TEST_PHONE) {
      const testCode = process.env.OTP_TEST_CODE;
      if (!testCode) {
        throw new AppError('OTP_TEST_CODE must be set when OTP_MODE=test_pair', 500);
      }
      code = testCode;
    } else {
      code = buildCode(codeLength);
    }

    const codeHash = hashCode(code);
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    const otpRow = await this.repo.create({
      phone: input.phone,
      codeHash,
      purpose: input.purpose,
      maxAttempts: maxVerifyAttempts,
      expiresAt,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    // Best-effort send. The row is already inserted; the user can request again
    // (rate limit applies). We don't roll back because doing so would let
    // attackers distinguish send-success from rate-limit responses.
    try {
      const result = await this.smsProvider.send(input.phone, `Arena code: ${code}`);
      if (!result.success) {
        console.error(`[OTP] SMS send failed for ${input.phone}:`, result.errorCode, result.errorMessage);
      }
    } catch (err) {
      console.error(`[OTP] SMS provider threw for ${input.phone}:`, err);
    }

    return { requestId: otpRow.id, expiresAt };
  }

  async verify(input: VerifyInput): Promise<{ verified: true }> {
    const submittedHash = hashCode(input.code);

    return await transaction(async (client) => {
      // Find the most recent unconsumed OTP for this phone+purpose, then lock it for update.
      const active = await this.repo.findActiveByPhone(input.phone, input.purpose);
      if (!active) {
        throw new AppError('No active OTP found for this phone.', 400, 'OTP_NOT_FOUND');
      }

      const locked = await this.repo.findByIdForUpdate(active.id, client);
      if (!locked) {
        throw new AppError('No active OTP found for this phone.', 400, 'OTP_NOT_FOUND');
      }

      if (locked.consumedAt) {
        throw new AppError('This OTP has already been used.', 400, 'OTP_ALREADY_USED');
      }

      if (new Date(locked.expiresAt) < new Date()) {
        throw new AppError('OTP has expired. Request a new code.', 400, 'OTP_EXPIRED');
      }

      if (locked.attempts >= locked.maxAttempts) {
        throw new AppError('Too many incorrect attempts. Request a new code.', 400, 'OTP_TOO_MANY_ATTEMPTS');
      }

      if (locked.codeHash !== submittedHash) {
        await this.repo.incrementAttempts(locked.id, client);
        throw new AppError('Invalid OTP code.', 400, 'OTP_INVALID_CODE');
      }

      await this.repo.markConsumed(locked.id, client);
      return { verified: true };
    });
  }
}
