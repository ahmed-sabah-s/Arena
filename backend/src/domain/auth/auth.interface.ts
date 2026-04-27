import { RefreshToken } from './auth.entity';

export interface IRefreshTokenRepository {
  create(userId: string, token: string, expiresAt: Date): Promise<RefreshToken>;
  findByToken(token: string): Promise<RefreshToken | null>;
  findByTokenIncludingRevoked(token: string): Promise<RefreshToken | null>;
  /** Atomically revokes the token. Returns the token record if it was active, null if already revoked (race/reuse). */
  revokeAndGet(token: string): Promise<RefreshToken | null>;
  revoke(token: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<number>;
  deleteExpired(): Promise<void>;
}
