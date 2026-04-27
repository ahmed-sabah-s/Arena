import { query } from '../../../db.js';
import type { CustomClient } from '../../../db.js';
import { AppError } from '../../../shared/errors/index.js';
import type {
  CreateOtpRequestInput,
  IOtpRepository,
  OtpPurpose,
  OtpRequest,
} from './IOtpRepository.js';

export class OtpRepository implements IOtpRepository {
  async create(input: CreateOtpRequestInput): Promise<OtpRequest> {
    const [row] = await query<OtpRequest>(
      `INSERT INTO "otpRequests" (phone, "codeHash", purpose, "maxAttempts", "expiresAt", "ipAddress", "userAgent")
       VALUES (:phone, :codeHash, :purpose, :maxAttempts, :expiresAt, :ipAddress, :userAgent)
       RETURNING *`,
      {
        phone: input.phone,
        codeHash: input.codeHash,
        purpose: input.purpose,
        maxAttempts: input.maxAttempts,
        expiresAt: input.expiresAt,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    );
    if (!row) throw new AppError('Failed to create OTP request', 500);
    return row;
  }

  async findActiveByPhone(phone: string, purpose: OtpPurpose): Promise<OtpRequest | null> {
    const [row] = await query<OtpRequest>(
      `SELECT * FROM "otpRequests"
       WHERE phone = :phone AND purpose = :purpose AND "consumedAt" IS NULL
       ORDER BY "createdAt" DESC
       LIMIT 1`,
      { phone, purpose },
    );
    return row ?? null;
  }

  async findByIdForUpdate(id: string, client: CustomClient): Promise<OtpRequest | null> {
    const result = await client.query<OtpRequest>(
      `SELECT * FROM "otpRequests" WHERE id = :id FOR UPDATE`,
      { id },
    );
    return result.rows[0] ?? null;
  }

  async incrementAttempts(id: string, client: CustomClient): Promise<void> {
    await client.query(
      `UPDATE "otpRequests" SET attempts = attempts + 1 WHERE id = :id`,
      { id },
    );
  }

  async markConsumed(id: string, client: CustomClient): Promise<void> {
    await client.query(
      `UPDATE "otpRequests" SET "consumedAt" = CURRENT_TIMESTAMP WHERE id = :id`,
      { id },
    );
  }

  async countSendsInWindow(phone: string, sinceMinutes: number): Promise<number> {
    const [row] = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM "otpRequests"
       WHERE phone = :phone
       AND "createdAt" > CURRENT_TIMESTAMP - (:minutes || ' minutes')::interval`,
      { phone, minutes: sinceMinutes.toString() },
    );
    return parseInt(row?.count ?? '0', 10);
  }
}
