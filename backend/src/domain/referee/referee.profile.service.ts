import { query } from '../../db.js';
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
} from '../../shared/errors/index.js';
import type { RefereeCertification, RefereeProfile } from './referee.entity.js';
import type {
  IRefereeCertificationRepository,
  IRefereeProfileRepository,
  UpdateRefereeProfileData,
} from './referee.interface.js';

/**
 * Profile-side referee operations: idempotent profile creation, self-service
 * updates (bio, base city, accepting toggle), and the admin certification
 * lifecycle (certify / revoke / query).
 *
 * Reliability score, no-show counters, and the captain-flag counter are owned
 * by the assignment service — those mutate as a side effect of officiating
 * lifecycle events, not via direct profile edits.
 */
export class RefereeProfileService {
  constructor(
    private readonly profileRepo: IRefereeProfileRepository,
    private readonly certRepo: IRefereeCertificationRepository,
  ) {}

  /**
   * Idempotent. Call when a user is granted the `referee` role; returns the
   * existing profile if there already is one.
   */
  async createOrGetProfile(userId: string): Promise<RefereeProfile> {
    const existing = await this.profileRepo.findByUserId(userId);
    if (existing) return existing;
    return this.profileRepo.create(userId);
  }

  async getMyProfile(userId: string): Promise<RefereeProfile> {
    const profile = await this.profileRepo.findByUserId(userId);
    if (!profile) throw new NotFoundError('RefereeProfile');
    return profile;
  }

  async updateProfile(
    userId: string,
    partial: UpdateRefereeProfileData,
  ): Promise<RefereeProfile> {
    const existing = await this.profileRepo.findByUserId(userId);
    if (!existing) throw new NotFoundError('RefereeProfile');
    return this.profileRepo.update(userId, partial);
  }

  async certifyForGame(
    userId: string,
    gameId: string,
    byUserId: string,
    notes?: string | null,
  ): Promise<RefereeCertification> {
    await this.assertAdmin(byUserId);
    // Profile must exist; auto-create if the user has the referee role but no
    // profile yet (defensive — normally the role-grant flow creates it).
    const profile = await this.profileRepo.findByUserId(userId);
    if (!profile) {
      await this.assertHasRefereeRole(userId);
      await this.profileRepo.create(userId);
    }
    const existing = await this.certRepo.findActiveByUserAndGame(userId, gameId);
    if (existing) throw new ConflictError('REFEREE_ALREADY_CERTIFIED');
    return this.certRepo.create({
      userId,
      gameId,
      certifiedByUserId: byUserId,
      notes: notes ?? null,
    });
  }

  async revokeCertification(
    userId: string,
    gameId: string,
    byUserId: string,
    reason: string,
  ): Promise<RefereeCertification> {
    await this.assertAdmin(byUserId);
    const cert = await this.certRepo.findActiveByUserAndGame(userId, gameId);
    if (!cert) throw new NotFoundError('RefereeCertification');
    return this.certRepo.revoke(cert.id, byUserId, reason);
  }

  async listCertifications(userId: string): Promise<RefereeCertification[]> {
    return this.certRepo.findActiveByUser(userId);
  }

  async isCertifiedFor(userId: string, gameId: string): Promise<boolean> {
    return this.certRepo.userIsCertifiedFor(userId, gameId);
  }

  // ─── role helpers ─────────────────────────────────────────────────────────

  private async assertAdmin(userId: string): Promise<void> {
    const [row] = await query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM "userRole" ur
         JOIN role r ON r.id = ur."roleId"
         WHERE ur."userId" = :userId AND r.name = 'admin'
       ) AS exists`,
      { userId },
    );
    if (!row?.exists) throw new AuthorizationError('NOT_ADMIN');
  }

  private async assertHasRefereeRole(userId: string): Promise<void> {
    const [row] = await query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM "userRole" ur
         JOIN role r ON r.id = ur."roleId"
         WHERE ur."userId" = :userId AND r.name = 'referee'
       ) AS exists`,
      { userId },
    );
    if (!row?.exists) throw new AuthorizationError('USER_LACKS_REFEREE_ROLE');
  }
}
