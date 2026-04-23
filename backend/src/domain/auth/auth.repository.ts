import { query } from '../../db';
import { IRefreshTokenRepository } from './auth.interface';
import { RefreshToken } from './auth.entity';
import { AppError } from '../../shared/errors';

export class RefreshTokenRepository implements IRefreshTokenRepository {
  async create(userId: string, token: string, expiresAt: Date): Promise<RefreshToken> {
    const [row] = await query<RefreshToken>(
      `INSERT INTO "refreshToken" (token, "userId", "expiresAt")
       VALUES (:token, :userId, :expiresAt) RETURNING *`,
      { token, userId, expiresAt }
    );
    if (!row) throw new AppError('Failed to create refresh token', 500);
    return row;
  }

  async findByToken(token: string): Promise<RefreshToken | null> {
    const [row] = await query<RefreshToken>(
      `SELECT * FROM "refreshToken" WHERE token = :token AND "revokedAt" IS NULL`,
      { token }
    );
    return row ?? null;
  }

  async findByTokenIncludingRevoked(token: string): Promise<RefreshToken | null> {
    const [row] = await query<RefreshToken>(
      `SELECT * FROM "refreshToken" WHERE token = :token`,
      { token }
    );
    return row ?? null;
  }

  /**
   * Atomically revokes the token only if it is not already revoked.
   * Returns the row if revocation succeeded; null means it was already revoked (possible reuse attack).
   */
  async revokeAndGet(token: string): Promise<RefreshToken | null> {
    const [row] = await query<RefreshToken>(
      `UPDATE "refreshToken" SET "revokedAt" = CURRENT_TIMESTAMP
       WHERE token = :token AND "revokedAt" IS NULL
       RETURNING *`,
      { token }
    );
    return row ?? null;
  }

  async revoke(token: string): Promise<void> {
    await query(
      `UPDATE "refreshToken" SET "revokedAt" = CURRENT_TIMESTAMP WHERE token = :token`,
      { token }
    );
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await query(
      `UPDATE "refreshToken" SET "revokedAt" = CURRENT_TIMESTAMP
       WHERE "userId" = :userId AND "revokedAt" IS NULL`,
      { userId }
    );
  }

  async deleteExpired(): Promise<void> {
    await query(
      `DELETE FROM "refreshToken" WHERE "expiresAt" < CURRENT_TIMESTAMP OR "revokedAt" IS NOT NULL`
    );
  }
}
