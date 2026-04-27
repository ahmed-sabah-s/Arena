import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { AuthenticationError } from '../../errors';

export interface JwtPayload {
  userId: string;
  /** Email is optional — phone-only users have no email. */
  email?: string | null;
  type: 'access' | 'refresh' | 'reset';
  /** First 12 chars of the current password hash — invalidates token after password changes */
  pwdFingerprint?: string;
}

// Casts in this file fall into two patterns:
//   - `... as JwtPayload` on object literals: TypeScript widens `type: 'access'` to
//     string without the cast. Asserting JwtPayload preserves the literal in the
//     payload shape we sign.
//   - `jwt.verify(...) as JwtPayload`: jsonwebtoken returns `string | object | JwtPayload`;
//     we narrow to our payload shape and validate at runtime via the type-discriminator
//     check (`payload.type !== ...`) immediately after.
export class JwtService {
  generateAccessToken(userId: string, email?: string | null): string {
    // @types/jsonwebtoken uses ms.StringValue (branded) for expiresIn; our env strings
    // are validated by Zod at startup and are valid ms format, so the cast is safe.
    return jwt.sign(
      { userId, email: email ?? null, type: 'access' } as JwtPayload,
      config.JWT_SECRET,
      { expiresIn: config.JWT_EXPIRES_IN as unknown as number }
    );
  }

  generateRefreshToken(userId: string, email?: string | null): string {
    return jwt.sign(
      { userId, email: email ?? null, type: 'refresh' } as JwtPayload,
      config.JWT_REFRESH_SECRET,
      { expiresIn: config.JWT_REFRESH_EXPIRES_IN as unknown as number }
    );
  }

  /**
   * pwdFingerprint — first 12 chars of the stored password hash.
   * After a successful reset the hash changes, making all previously issued tokens invalid.
   * This makes the token single-use without needing a DB table.
   */
  generatePasswordResetToken(userId: string, email: string, pwdFingerprint: string): string {
    return jwt.sign(
      { userId, email, type: 'reset', pwdFingerprint } as JwtPayload,
      config.JWT_SECRET,
      { expiresIn: '15m' as unknown as number }
    );
  }

  verifyPasswordResetToken(token: string): JwtPayload {
    try {
      const payload = jwt.verify(token, config.JWT_SECRET) as JwtPayload;
      if (payload.type !== 'reset') {
        throw new AuthenticationError('Invalid token type');
      }
      return payload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AuthenticationError('Password reset link has expired');
      }
      throw new AuthenticationError('Invalid or expired reset token');
    }
  }

  verifyAccessToken(token: string): JwtPayload {
    try {
      const payload = jwt.verify(token, config.JWT_SECRET) as JwtPayload;
      if (payload.type !== 'access') {
        throw new AuthenticationError('Invalid token type');
      }
      return payload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AuthenticationError('Token expired');
      }
      throw new AuthenticationError('Invalid token');
    }
  }

  verifyRefreshToken(token: string): JwtPayload {
    try {
      const payload = jwt.verify(token, config.JWT_REFRESH_SECRET) as JwtPayload;
      if (payload.type !== 'refresh') {
        throw new AuthenticationError('Invalid token type');
      }
      return payload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AuthenticationError('Token expired');
      }
      throw new AuthenticationError('Invalid token');
    }
  }
}
