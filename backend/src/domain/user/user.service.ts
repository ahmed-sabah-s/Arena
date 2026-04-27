import { IUserRepository } from './user.interface';
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
  AuthorizationError,
  ValidationError,
} from '../../shared/errors';
import { UserMapper } from './user.mapper';
import { UserDTO } from './user.dto';
import { IRoleRepository } from '../role/role.interface';
import { AuditLogRepository } from '../audit/audit.repository';
import { PasswordService } from '../../shared/security';
import { OtpService, type OtpPurpose } from '../auth/otp';
import { JwtService } from '../../shared/security';
import { IRefreshTokenRepository } from '../auth/auth.interface';
import type {
  CompleteOnboardingInput,
  UpdateProfileInput,
  SetEmailAndPasswordInput,
  ChangePasswordInput,
} from '@arena/shared';

export class UserService {
  private auditRepository = new AuditLogRepository();

  constructor(
    private userRepository: IUserRepository,
    private roleRepository: IRoleRepository,
    private passwordService: PasswordService = new PasswordService(),
    private otpService?: OtpService,
    private jwtService: JwtService = new JwtService(),
    private refreshTokenRepository?: IRefreshTokenRepository,
  ) {}

  async getUserById(userId: string, requesterId: string): Promise<UserDTO> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new NotFoundError('User');

    if (userId !== requesterId) {
      const hasPermission = await this.userRepository.hasPermission(requesterId, 'users', 'read');
      if (!hasPermission) {
        throw new AuthorizationError('You do not have permission to view this user');
      }
    }

    return UserMapper.toDTO(user);
  }

  async getMe(userId: string): Promise<UserDTO> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new NotFoundError('User');
    return UserMapper.toDTO(user);
  }

  async getUsers(
    page: number,
    limit: number,
    search: string | undefined,
    requesterId: string,
  ): Promise<{ users: UserDTO[]; total: number; page: number; pages: number }> {
    const hasPermission = await this.userRepository.hasPermission(requesterId, 'users', 'read');
    if (!hasPermission) throw new AuthorizationError('You do not have permission to view users');

    const skip = (page - 1) * limit;
    const { users, total } = await this.userRepository.findMany({ skip, take: limit, search });

    return {
      users: UserMapper.toDTOArray(users),
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  // ─── Phase 2 self-service profile ──────────────────────────────────────────

  async completeOnboarding(userId: string, input: CompleteOnboardingInput): Promise<UserDTO> {
    await this.userRepository.update(userId, {
      fullName: input.fullName,
      gender: input.gender ?? null,
      city: input.city,
      preferredLanguage: input.preferredLanguage,
      preferredCurrency: input.preferredCurrency,
      experienceLevel: input.experienceLevel,
      onboardingCompletedAt: new Date(),
    });
    const user = await this.userRepository.findById(userId);
    if (!user) throw new NotFoundError('User');
    return UserMapper.toDTO(user);
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<UserDTO> {
    await this.userRepository.update(userId, input);
    const user = await this.userRepository.findById(userId);
    if (!user) throw new NotFoundError('User');
    return UserMapper.toDTO(user);
  }

  async setEmailAndPassword(userId: string, input: SetEmailAndPasswordInput): Promise<UserDTO> {
    const validation = this.passwordService.validate(input.password);
    if (!validation.valid) throw new ValidationError(validation.errors.join(', '));

    const existingByEmail = await this.userRepository.findByEmail(input.email);
    if (existingByEmail && existingByEmail.id !== userId) {
      throw new ConflictError('Email is already used by another account');
    }

    const hashedPassword = await this.passwordService.hash(input.password);
    await this.userRepository.update(userId, {
      email: input.email,
      password: hashedPassword,
    });
    const user = await this.userRepository.findById(userId);
    if (!user) throw new NotFoundError('User');
    return UserMapper.toDTO(user);
  }

  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new NotFoundError('User');
    if (!user.password) {
      throw new ValidationError('NO_PASSWORD_SET');
    }
    const valid = await this.passwordService.compare(input.currentPassword, user.password);
    if (!valid) throw new AuthenticationError('Current password is incorrect');

    const validation = this.passwordService.validate(input.newPassword);
    if (!validation.valid) throw new ValidationError(validation.errors.join(', '));

    const hashed = await this.passwordService.hash(input.newPassword);
    await this.userRepository.update(userId, { password: hashed });
  }

  async requestPhoneChangeOtp(userId: string, newPhone: string, meta?: { ipAddress?: string; userAgent?: string }): Promise<{ requestId: string; expiresAt: Date }> {
    if (!this.otpService) throw new Error('UserService: OtpService not wired');
    const existing = await this.userRepository.findByPhone(newPhone);
    if (existing && existing.id !== userId) {
      throw new ConflictError('PHONE_ALREADY_REGISTERED');
    }
    return this.otpService.send({ phone: newPhone, purpose: 'phone_change', ipAddress: meta?.ipAddress, userAgent: meta?.userAgent });
  }

  async verifyPhoneChangeOtp(userId: string, newPhone: string, code: string): Promise<{ user: UserDTO; accessToken: string; refreshToken: string }> {
    if (!this.otpService || !this.refreshTokenRepository) {
      throw new Error('UserService: OtpService and RefreshTokenRepository must be wired');
    }
    await this.otpService.verify({ phone: newPhone, code, purpose: 'phone_change' as OtpPurpose });

    const conflict = await this.userRepository.findByPhone(newPhone);
    if (conflict && conflict.id !== userId) {
      throw new ConflictError('PHONE_ALREADY_REGISTERED');
    }

    await this.userRepository.update(userId, {
      phone: newPhone,
      phoneVerifiedAt: new Date(),
    });
    const user = await this.userRepository.findById(userId);
    if (!user) throw new NotFoundError('User');

    // Issue fresh tokens because the auth factor changed.
    const accessToken = this.jwtService.generateAccessToken(user.id, user.email);
    const refreshToken = this.jwtService.generateRefreshToken(user.id, user.email);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.refreshTokenRepository.create(user.id, refreshToken, expiresAt);

    return { user: UserMapper.toDTO(user), accessToken, refreshToken };
  }

  // ─── Admin operations (kept from template) ────────────────────────────────

  async updateUser(
    userId: string,
    data: { fullName?: string; avatar?: string; phone?: string; isActive?: boolean },
    requesterId: string,
  ): Promise<UserDTO> {
    const isSelf = userId === requesterId;

    if (!isSelf) {
      const hasPermission = await this.userRepository.hasPermission(requesterId, 'users', 'update');
      if (!hasPermission) {
        throw new AuthorizationError('You do not have permission to update this user');
      }
    }

    if (isSelf && data.isActive === false) {
      throw new AuthorizationError('You cannot deactivate your own account');
    }

    await this.userRepository.update(userId, data);
    const user = await this.userRepository.findById(userId);
    if (!user) throw new NotFoundError('User');
    return UserMapper.toDTO(user);
  }

  async deleteUser(userId: string, requesterId: string, meta?: { ipAddress?: string; userAgent?: string }): Promise<void> {
    const hasPermission = await this.userRepository.hasPermission(requesterId, 'users', 'delete');
    if (!hasPermission) throw new AuthorizationError('You do not have permission to delete users');
    if (userId === requesterId) throw new AuthorizationError('You cannot delete your own account');

    await this.userRepository.delete(userId);

    this.auditRepository.create({
      userId: requesterId,
      action: 'user.delete',
      resource: 'user',
      details: { deletedUserId: userId },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    }).catch(console.error);
  }

  async assignRoles(
    userId: string,
    roleIds: string[],
    requesterId: string,
    meta?: { ipAddress?: string; userAgent?: string },
  ): Promise<void> {
    const hasPermission = await this.userRepository.hasPermission(requesterId, 'users', 'update');
    if (!hasPermission) throw new AuthorizationError('You do not have permission to assign roles');

    const targetUser = await this.userRepository.findById(userId);
    if (!targetUser) throw new NotFoundError('User');

    if (roleIds.length > 0) {
      const invalid: string[] = [];
      for (const roleId of roleIds) {
        const role = await this.roleRepository.findById(roleId);
        if (!role) invalid.push(roleId);
      }
      if (invalid.length > 0) throw new ValidationError(`Role(s) not found: ${invalid.join(', ')}`);
    }

    await this.userRepository.assignRoles(userId, roleIds);

    this.auditRepository.create({
      userId: requesterId,
      action: 'user.assignRoles',
      resource: 'user',
      details: { targetUserId: userId, roleIds },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    }).catch(console.error);
  }
}
