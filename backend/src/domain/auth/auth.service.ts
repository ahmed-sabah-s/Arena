import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors";
import {
  JwtService,
  PasswordService,
  TwoFactorService,
} from "../../shared/security";
import { EmailService } from "../../shared/service";
import { IUserRepository, UserDTO, UserMapper } from "../user";
import { IRefreshTokenRepository } from "./auth.interface";
import { OtpService } from "./otp";

interface AuthSession {
  user: UserDTO;
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  constructor(
    private userRepository: IUserRepository,
    private refreshTokenRepository: IRefreshTokenRepository,
    private jwtService: JwtService,
    private passwordService: PasswordService,
    private twoFactorService: TwoFactorService,
    private emailService: EmailService,
    private otpService: OtpService,
  ) {}

  // ─── OTP-based phone auth (Arena primary path) ────────────────────────────

  async requestRegistrationOtp(input: { phone: string; ipAddress?: string; userAgent?: string }): Promise<{ requestId: string; expiresAt: Date }> {
    const existing = await this.userRepository.findByPhone(input.phone);
    if (existing) {
      throw new ConflictError('PHONE_ALREADY_REGISTERED');
    }
    return this.otpService.send({ phone: input.phone, purpose: 'registration', ipAddress: input.ipAddress, userAgent: input.userAgent });
  }

  async verifyRegistrationOtp(input: { phone: string; code: string }): Promise<AuthSession> {
    await this.otpService.verify({ phone: input.phone, code: input.code, purpose: 'registration' });

    // Race check: someone else may have registered the phone between OTP request and verify.
    const conflict = await this.userRepository.findByPhone(input.phone);
    if (conflict) {
      throw new ConflictError('PHONE_ALREADY_REGISTERED');
    }

    const created = await this.userRepository.create({
      phone: input.phone,
      country: 'IQ',
      preferredLanguage: 'ar',
      preferredCurrency: 'IQD',
      phoneVerifiedAt: new Date(),
    });

    const userWithRoles = await this.userRepository.findById(created.id);
    if (!userWithRoles) throw new NotFoundError('User');

    return this.issueSession(userWithRoles);
  }

  async requestLoginOtp(input: { phone: string; ipAddress?: string; userAgent?: string }): Promise<{ requestId: string; expiresAt: Date }> {
    const user = await this.userRepository.findByPhone(input.phone);
    if (!user) {
      // Generic error to avoid leaking account existence to attackers
      throw new AuthenticationError('USER_NOT_FOUND');
    }
    return this.otpService.send({ phone: input.phone, purpose: 'login', ipAddress: input.ipAddress, userAgent: input.userAgent });
  }

  async verifyLoginOtp(input: { phone: string; code: string }): Promise<AuthSession> {
    await this.otpService.verify({ phone: input.phone, code: input.code, purpose: 'login' });

    const user = await this.userRepository.findByPhone(input.phone);
    if (!user) throw new AuthenticationError('USER_NOT_FOUND');
    if (!user.isActive) throw new AuthenticationError('Account is disabled');

    await this.userRepository.update(user.id, { lastLoginAt: new Date() });
    return this.issueSession(user);
  }

  // ─── Email + password (secondary, opt-in) ─────────────────────────────────

  async loginWithPassword(
    email: string,
    password: string,
    twoFactorCode?: string,
  ): Promise<AuthSession> {
    const user = await this.userRepository.findByEmail(email);

    // Constant-time-ish path: still run bcrypt compare for non-existent users
    // and users with no password to avoid user-enumeration via response timing.
    const DUMMY_HASH = '$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
    const isPasswordValid = await this.passwordService.compare(
      password,
      user?.password ?? DUMMY_HASH,
    );

    if (!user || !user.password || !isPasswordValid) {
      throw new AuthenticationError('Invalid credentials');
    }

    if (!user.isActive) {
      throw new AuthenticationError('Account is disabled');
    }

    if (user.twoFactorEnabled) {
      if (!twoFactorCode) throw new AuthenticationError('Two-factor code required');
      if (!user.twoFactorSecret) throw new AuthenticationError('Two-factor not properly configured');
      if (!this.twoFactorService.verifyToken(user.twoFactorSecret, twoFactorCode)) {
        throw new AuthenticationError('Invalid two-factor code');
      }
    }

    await this.userRepository.update(user.id, { lastLoginAt: new Date() });
    return this.issueSession(user);
  }

  // ─── Refresh / logout ──────────────────────────────────────────────────────

  async refreshSession(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = this.jwtService.verifyRefreshToken(refreshToken);

    // Reuse-detection: if the token is in the table but already revoked, revoke
    // all sessions for the user. This catches a stolen-token scenario where the
    // attacker uses an old refresh token after the legitimate user already rotated.
    const tokenRecord = await this.refreshTokenRepository.findByTokenIncludingRevoked(refreshToken);
    if (!tokenRecord) {
      throw new AuthenticationError('Invalid refresh token');
    }
    if (tokenRecord.revokedAt) {
      await this.refreshTokenRepository.revokeAllForUser(payload.userId);
      throw new AuthenticationError('Refresh token reuse detected. All sessions revoked.');
    }
    if (tokenRecord.expiresAt < new Date()) {
      throw new AuthenticationError('Refresh token has expired');
    }

    const user = await this.userRepository.findById(payload.userId);
    if (!user) throw new AuthenticationError('User not found');

    // Rotate atomically — if revoke returns null someone else won the race
    const revoked = await this.refreshTokenRepository.revokeAndGet(refreshToken);
    if (!revoked) {
      await this.refreshTokenRepository.revokeAllForUser(payload.userId);
      throw new AuthenticationError('Refresh token reuse detected. All sessions revoked.');
    }

    const newAccessToken = this.jwtService.generateAccessToken(user.id, user.email);
    const newRefreshToken = this.jwtService.generateRefreshToken(user.id, user.email);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.refreshTokenRepository.create(user.id, newRefreshToken, expiresAt);

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  async logout(refreshToken: string): Promise<{ success: true }> {
    // Best-effort: don't fail if token is already revoked or doesn't exist.
    await this.refreshTokenRepository.revoke(refreshToken).catch(() => {});
    return { success: true };
  }

  async logoutAll(userId: string): Promise<{ revokedCount: number }> {
    const revokedCount = await this.refreshTokenRepository.revokeAllForUser(userId);
    return { revokedCount };
  }

  // ─── Forgot/reset password (still email-based) ────────────────────────────

  async forgotPassword(email: string): Promise<void> {
    const user = await this.userRepository.findByEmail(email);

    const sendEmail = async () => {
      if (!user || !user.email || !user.password) return;
      const fingerprint = user.password.substring(0, 12);
      const resetToken = this.jwtService.generatePasswordResetToken(user.id, user.email, fingerprint);
      await this.emailService.sendPasswordResetEmail(user.email, resetToken);
    };

    // Constant-ish response time to avoid user enumeration
    await Promise.all([
      sendEmail().catch(console.error),
      new Promise((r) => setTimeout(r, 200)),
    ]);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const payload = this.jwtService.verifyPasswordResetToken(token);

    const user = await this.userRepository.findById(payload.userId);
    if (!user) throw new NotFoundError('User');

    if (!user.password) {
      // Should not happen with a valid token + fingerprint check, but guard anyway.
      throw new AuthenticationError('Password reset is unavailable for this account');
    }

    if (payload.pwdFingerprint && user.password.substring(0, 12) !== payload.pwdFingerprint) {
      throw new AuthenticationError('Password reset link has already been used');
    }

    const validation = this.passwordService.validate(newPassword);
    if (!validation.valid) throw new ValidationError(validation.errors.join(', '));

    const hashedPassword = await this.passwordService.hash(newPassword);
    await this.userRepository.update(user.id, { password: hashedPassword });
    await this.refreshTokenRepository.revokeAllForUser(user.id);
  }

  // ─── 2FA (preserved from template) ────────────────────────────────────────

  async enable2FA(userId: string): Promise<{ secret: string; qrCode: string }> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new NotFoundError('User');
    if (user.twoFactorEnabled) throw new ConflictError('Two-factor authentication is already enabled');

    // Use email if available, else phone — TOTP needs a label for the authenticator app.
    const label = user.email ?? user.phone;
    const { secret, otpauthUrl } = this.twoFactorService.generateSecret(label);
    const qrCode = await this.twoFactorService.generateQRCode(otpauthUrl);

    await this.userRepository.update(userId, { twoFactorSecret: secret });
    return { secret, qrCode };
  }

  async verify2FA(userId: string, token: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new NotFoundError('User');
    if (!user.twoFactorSecret) throw new ValidationError('Two-factor secret not found');
    if (!this.twoFactorService.verifyToken(user.twoFactorSecret, token)) {
      throw new AuthenticationError('Invalid two-factor code');
    }
    await this.userRepository.update(userId, { twoFactorEnabled: true });
  }

  async disable2FA(userId: string, token: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new NotFoundError('User');
    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new ValidationError('Two-factor authentication is not enabled');
    }
    if (!this.twoFactorService.verifyToken(user.twoFactorSecret, token)) {
      throw new AuthenticationError('Invalid two-factor code');
    }
    await this.userRepository.update(userId, { twoFactorEnabled: false, twoFactorSecret: null });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async issueSession(user: import('../user').UserWithRoles): Promise<AuthSession> {
    const accessToken = this.jwtService.generateAccessToken(user.id, user.email);
    const refreshToken = this.jwtService.generateRefreshToken(user.id, user.email);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.refreshTokenRepository.create(user.id, refreshToken, expiresAt);
    return {
      user: UserMapper.toDTO(user),
      accessToken,
      refreshToken,
    };
  }
}
