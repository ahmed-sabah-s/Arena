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
import { IAuditLogRepository } from "../audit/audit.interface";
import { AuditLogRepository } from "../audit/audit.repository";
import { IRefreshTokenRepository } from "./auth.interface";

export class AuthService {
  private auditRepository: IAuditLogRepository = new AuditLogRepository();

  constructor(
    private userRepository: IUserRepository,
    private refreshTokenRepository: IRefreshTokenRepository,
    private jwtService: JwtService,
    private passwordService: PasswordService,
    private twoFactorService: TwoFactorService,
    private emailService: EmailService,
  ) {}

  async register(
    email: string,
    password: string,
    name: string,
  ): Promise<UserDTO> {
    const existingUser = await this.userRepository.findByEmail(email);
    if (existingUser) {
      throw new ConflictError("User with this email already exists");
    }

    const validation = this.passwordService.validate(password);
    if (!validation.valid) {
      throw new ValidationError(validation.errors.join(", "));
    }

    const hashedPassword = await this.passwordService.hash(password);

    const user = await this.userRepository.create({
      email,
      password: hashedPassword,
      name,
    });

    await this.emailService.sendWelcomeEmail(email, name).catch(console.error);

    const userWithRoles = await this.userRepository.findById(user.id);
    if (!userWithRoles) {
      throw new NotFoundError("User");
    }

    return UserMapper.toDTO(userWithRoles);
  }

  async login(
    email: string,
    password: string,
    twoFactorCode?: string,
    meta?: { ipAddress?: string; userAgent?: string },
  ): Promise<{ accessToken: string; refreshToken: string; user: UserDTO }> {
    const user = await this.userRepository.findByEmail(email);

    // Always run bcrypt compare (even for non-existent users) to keep response time constant
    // and prevent user-enumeration via timing differences.
    const DUMMY_HASH = '$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
    const isPasswordValid = await this.passwordService.compare(
      password,
      user ? user.password : DUMMY_HASH,
    );

    if (!user || !isPasswordValid) {
      throw new AuthenticationError("Invalid credentials");
    }

    if (!user.isActive) {
      throw new AuthenticationError("Account is disabled");
    }

    if (user.twoFactorEnabled) {
      if (!twoFactorCode) {
        throw new AuthenticationError("Two-factor code required");
      }
      if (!user.twoFactorSecret) {
        throw new AuthenticationError("Two-factor not properly configured");
      }
      const isValid = this.twoFactorService.verifyToken(
        user.twoFactorSecret,
        twoFactorCode,
      );
      if (!isValid) {
        throw new AuthenticationError("Invalid two-factor code");
      }
    }

    await this.userRepository.update(user.id, {
      lastLoginAt: new Date(),
    });

    const accessToken = this.jwtService.generateAccessToken(
      user.id,
      user.email,
    );
    const refreshToken = this.jwtService.generateRefreshToken(
      user.id,
      user.email,
    );

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.refreshTokenRepository.create(user.id, refreshToken, expiresAt);

    this.auditRepository.create({
      userId: user.id,
      action: 'auth.login',
      resource: 'auth',
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    }).catch(console.error);

    return {
      accessToken,
      refreshToken,
      user: UserMapper.toDTO(user),
    };
  }

  async refreshAccessToken(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = this.jwtService.verifyRefreshToken(refreshToken);

    // Check including revoked — if it exists but is revoked, detect reuse attack
    const tokenRecord =
      await this.refreshTokenRepository.findByTokenIncludingRevoked(refreshToken);
    if (!tokenRecord) {
      throw new AuthenticationError("Invalid refresh token");
    }

    if (tokenRecord.revokedAt) {
      // Token reuse detected — revoke all sessions for this user
      await this.refreshTokenRepository.revokeAllForUser(payload.userId);
      throw new AuthenticationError("Refresh token reuse detected. All sessions revoked.");
    }

    if (tokenRecord.expiresAt < new Date()) {
      throw new AuthenticationError("Refresh token has expired");
    }

    const user = await this.userRepository.findById(payload.userId);
    if (!user) {
      throw new AuthenticationError("User not found");
    }

    // Atomic revocation — if null, another request won the race; treat as reuse
    const revoked = await this.refreshTokenRepository.revokeAndGet(refreshToken);
    if (!revoked) {
      await this.refreshTokenRepository.revokeAllForUser(payload.userId);
      throw new AuthenticationError("Refresh token reuse detected. All sessions revoked.");
    }

    const newAccessToken = this.jwtService.generateAccessToken(
      user.id,
      user.email,
    );
    const newRefreshToken = this.jwtService.generateRefreshToken(
      user.id,
      user.email,
    );

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.refreshTokenRepository.create(
      user.id,
      newRefreshToken,
      expiresAt,
    );

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    await this.refreshTokenRepository.revoke(refreshToken);
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.userRepository.findByEmail(email);

    // Always wait the same amount of time to prevent user-enumeration via timing
    const sendEmail = async () => {
      if (!user) return;
      const fingerprint = user.password.substring(0, 12);
      const resetToken = this.jwtService.generatePasswordResetToken(user.id, user.email, fingerprint);
      await this.emailService.sendPasswordResetEmail(user.email, resetToken);
    };

    // Run in parallel with a minimum delay so response time is constant
    await Promise.all([
      sendEmail().catch(console.error),
      new Promise((r) => setTimeout(r, 200)),
    ]);
  }

  async resetPassword(token: string, newPassword: string, meta?: { ipAddress?: string; userAgent?: string }): Promise<void> {
    const payload = this.jwtService.verifyPasswordResetToken(token);

    const user = await this.userRepository.findById(payload.userId);
    if (!user) {
      throw new NotFoundError("User");
    }

    // Validate fingerprint — token was issued for a different password hash, meaning
    // it was already used (password changed) or the account was tampered with
    if (payload.pwdFingerprint && user.password.substring(0, 12) !== payload.pwdFingerprint) {
      throw new AuthenticationError("Password reset link has already been used");
    }

    const validation = this.passwordService.validate(newPassword);
    if (!validation.valid) {
      throw new ValidationError(validation.errors.join(", "));
    }

    const hashedPassword = await this.passwordService.hash(newPassword);

    await this.userRepository.update(user.id, {
      password: hashedPassword,
    });

    await this.refreshTokenRepository.revokeAllForUser(user.id);

    this.auditRepository.create({
      userId: user.id,
      action: 'auth.resetPassword',
      resource: 'auth',
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    }).catch(console.error);
  }

  async enable2FA(userId: string): Promise<{ secret: string; qrCode: string }> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError("User");
    }

    if (user.twoFactorEnabled) {
      throw new ConflictError("Two-factor authentication is already enabled");
    }

    const { secret, otpauthUrl } = this.twoFactorService.generateSecret(
      user.email,
    );
    const qrCode = await this.twoFactorService.generateQRCode(otpauthUrl);

    await this.userRepository.update(userId, {
      twoFactorSecret: secret,
    });

    return { secret, qrCode };
  }

  async verify2FA(userId: string, token: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError("User");
    }

    if (!user.twoFactorSecret) {
      throw new ValidationError("Two-factor secret not found");
    }

    const isValid = this.twoFactorService.verifyToken(
      user.twoFactorSecret,
      token,
    );
    if (!isValid) {
      throw new AuthenticationError("Invalid two-factor code");
    }

    await this.userRepository.update(userId, {
      twoFactorEnabled: true,
    });
  }

  async disable2FA(userId: string, token: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError("User");
    }

    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new ValidationError("Two-factor authentication is not enabled");
    }

    const isValid = this.twoFactorService.verifyToken(
      user.twoFactorSecret,
      token,
    );
    if (!isValid) {
      throw new AuthenticationError("Invalid two-factor code");
    }

    await this.userRepository.update(userId, {
      twoFactorEnabled: false,
      twoFactorSecret: null,
    });
  }
}
