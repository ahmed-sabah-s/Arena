import { transaction } from '../../db.js';
import {
  AppError,
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../shared/errors/index.js';
import { getConfigInteger } from '../../shared/config/platformConfig/index.js';
import type {
  ITeamRepository,
  ITeamMemberRepository,
  ITeamInviteRepository,
  ITeamCreationLogRepository,
} from './team.interface.js';
import type { Team, TeamMember, TeamInvite } from './team.entity.js';
import { query } from '../../db.js';
import type { EloService } from '../elo/elo.service.js';
import type { ExperienceLevel } from '../../shared/elo/index.js';

interface GameRow {
  id: string;
  slug: string;
  participantType: 'team' | 'individual';
  isActive: boolean;
}

interface FormatRow {
  id: string;
  gameId: string;
  minRosterSize: number;
  maxRosterSize: number;
  isActive: boolean;
}

interface DivisionRow {
  id: string;
  gameId: string;
  genderRestriction: 'male' | 'female' | 'mixed' | null;
  isActive: boolean;
}

interface UserRow {
  id: string;
  gender: 'male' | 'female' | 'prefer_not_say' | null;
  experienceLevel?: ExperienceLevel | null;
}

export class TeamService {
  constructor(
    private teamRepo: ITeamRepository,
    private memberRepo: ITeamMemberRepository,
    private inviteRepo: ITeamInviteRepository,
    private logRepo: ITeamCreationLogRepository,
    private eloService: EloService,
  ) {}

  // ─── createTeam ───────────────────────────────────────────────────────────

  async createTeam(
    input: {
      gameId: string;
      formatId: string;
      divisionId?: string | null;
      name: string;
      nameAr?: string;
      city?: string;
      primaryColor?: string;
    },
    captainUserId: string,
  ): Promise<{ team: Team; captainMember: TeamMember }> {
    const game = await this.fetchGame(input.gameId);
    if (!game) throw new NotFoundError('Game');
    if (!game.isActive) throw new ValidationError('GAME_INACTIVE');
    if (game.participantType !== 'team') {
      throw new ValidationError('GAME_DOES_NOT_SUPPORT_TEAMS');
    }

    const format = await this.fetchFormat(input.formatId);
    if (!format) throw new NotFoundError('GameFormat');
    if (!format.isActive) throw new ValidationError('FORMAT_INACTIVE');
    if (format.gameId !== game.id) throw new ValidationError('FORMAT_NOT_FOR_GAME');

    // Division: required when the game has divisions defined.
    const gameDivisions = await this.fetchActiveDivisions(game.id);
    let divisionId: string | null = input.divisionId ?? null;
    if (gameDivisions.length > 0 && !divisionId) {
      throw new ValidationError('DIVISION_REQUIRED_FOR_GAME');
    }
    if (divisionId) {
      const division = gameDivisions.find((d) => d.id === divisionId);
      if (!division) throw new ValidationError('DIVISION_NOT_FOR_GAME');
      const captain = await this.fetchUser(captainUserId);
      if (!captain) throw new NotFoundError('User');
      if (!this.genderMatchesDivision(captain.gender, division.genderRestriction)) {
        throw new ValidationError('CAPTAIN_GENDER_MISMATCH');
      }
    }

    // Cooldown: most recent disband must be older than the configured window.
    const cooldownDays = await getConfigInteger('captain_disband_cooldown_days');
    const lastDisband = await this.logRepo.findMostRecentDisband(captainUserId, game.id);
    if (lastDisband) {
      const ageMs = Date.now() - new Date(lastDisband).getTime();
      if (ageMs < cooldownDays * 24 * 60 * 60 * 1000) {
        throw new ConflictError('CAPTAIN_DISBAND_COOLDOWN_ACTIVE');
      }
    }

    // Max teams per window
    const windowDays = await getConfigInteger('team_creation_cooldown_days');
    const maxInWindow = await getConfigInteger('max_teams_per_user_per_game_per_window');
    const recentCreates = await this.logRepo.countCreatesInWindow(captainUserId, game.id, windowDays);
    if (recentCreates >= maxInWindow) {
      throw new ConflictError('MAX_TEAMS_LIMIT_REACHED');
    }

    const slug = await this.generateUniqueSlug(game.id, input.name);

    // Captain experience drives the seed ELO (Phase 4 — see EloService.seedTeamElo).
    // Fetched once here so we can pass it to the seeder inside the transaction.
    const captainForSeed = await this.fetchUser(captainUserId);
    const captainExperienceLevel = captainForSeed?.experienceLevel ?? null;

    return await transaction(async (client) => {
      const team = await this.teamRepo.create(
        {
          gameId: game.id,
          formatId: format.id,
          divisionId,
          captainId: captainUserId,
          name: input.name,
          nameAr: input.nameAr ?? null,
          slug,
          city: input.city ?? null,
          primaryColor: input.primaryColor ?? null,
        },
        client,
      );

      const captainMember = await this.memberRepo.create(
        {
          teamId: team.id,
          userId: captainUserId,
          gameId: game.id,
          formatId: format.id,
          divisionId,
          isCaptain: true,
        },
        client,
      );

      await this.logRepo.recordCreate(captainUserId, game.id, team.id, client);

      await this.eloService.seedTeamElo(
        {
          teamId: team.id,
          gameId: game.id,
          formatId: format.id,
          divisionId,
          captainExperienceLevel,
        },
        client,
      );

      return { team, captainMember };
    });
  }

  // ─── invite / accept / decline / cancel ───────────────────────────────────

  async inviteMember(
    input: {
      teamId: string;
      userId: string;
      position?: string;
      shirtNumber?: number;
      message?: string;
    },
    byUserId: string,
  ): Promise<TeamInvite> {
    const team = await this.requireActiveTeam(input.teamId);
    if (team.captainId !== byUserId) throw new AuthorizationError('NOT_TEAM_CAPTAIN');

    const invitee = await this.fetchUser(input.userId);
    if (!invitee) throw new NotFoundError('User');

    // Already on this team?
    const existingMember = await this.memberRepo.findByTeamAndUser(team.id, input.userId);
    if (existingMember) throw new ConflictError('USER_ALREADY_ON_TEAM');

    // On a different active team in the same scope?
    const conflicting = await this.memberRepo.findActiveByUserAndScope(
      input.userId, team.gameId, team.formatId, team.divisionId,
    );
    if (conflicting) throw new ConflictError('USER_ALREADY_IN_ACTIVE_TEAM_FOR_SCOPE');

    // Division gender check
    if (team.divisionId) {
      const division = await this.fetchDivision(team.divisionId);
      if (division && !this.genderMatchesDivision(invitee.gender ?? null, division.genderRestriction)) {
        throw new ValidationError('INVITEE_GENDER_MISMATCH');
      }
    }

    // Roster cap
    const format = await this.fetchFormat(team.formatId);
    if (!format) throw new NotFoundError('GameFormat');
    const activeMembers = await this.memberRepo.findActiveMembersByTeam(team.id);
    if (activeMembers.length >= format.maxRosterSize) {
      throw new ConflictError('TEAM_AT_MAX_ROSTER');
    }

    // Pending invite already exists?
    const existingInvite = await this.inviteRepo.findExistingPending(team.id, input.userId);
    if (existingInvite) throw new ConflictError('INVITE_ALREADY_PENDING');

    const expiryDays = await getConfigInteger('team_invite_expiry_days');
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

    return this.inviteRepo.create({
      teamId: team.id,
      invitedUserId: input.userId,
      invitedByUserId: byUserId,
      position: input.position ?? null,
      shirtNumber: input.shirtNumber ?? null,
      message: input.message ?? null,
      expiresAt,
    });
  }

  async acceptInvite(inviteId: string, userId: string): Promise<TeamMember> {
    const invite = await this.inviteRepo.findById(inviteId);
    if (!invite) throw new NotFoundError('Invite');
    if (invite.invitedUserId !== userId) throw new AuthorizationError('INVITE_NOT_FOR_USER');
    if (invite.status !== 'pending') throw new ConflictError('INVITE_NOT_PENDING');
    if (new Date(invite.expiresAt) < new Date()) {
      // Mark expired so future calls are explicit
      await transaction(async (client) => {
        await this.inviteRepo.markStatus(invite.id, 'expired', client);
      });
      throw new ConflictError('INVITE_EXPIRED');
    }

    const team = await this.requireActiveTeam(invite.teamId);
    const invitee = await this.fetchUser(userId);
    if (!invitee) throw new NotFoundError('User');

    // Re-check: invitee may have joined another team since invite was sent.
    const conflicting = await this.memberRepo.findActiveByUserAndScope(
      userId, team.gameId, team.formatId, team.divisionId,
    );
    if (conflicting) {
      await transaction(async (client) => {
        await this.inviteRepo.markStatus(invite.id, 'expired', client);
      });
      throw new ConflictError('USER_ALREADY_IN_ACTIVE_TEAM_FOR_SCOPE');
    }

    // Re-check division gender
    if (team.divisionId) {
      const division = await this.fetchDivision(team.divisionId);
      if (division && !this.genderMatchesDivision(invitee.gender ?? null, division.genderRestriction)) {
        await transaction(async (client) => {
          await this.inviteRepo.markStatus(invite.id, 'expired', client);
        });
        throw new ValidationError('INVITEE_GENDER_MISMATCH');
      }
    }

    // Re-check roster cap
    const format = await this.fetchFormat(team.formatId);
    if (!format) throw new NotFoundError('GameFormat');
    const activeMembers = await this.memberRepo.findActiveMembersByTeam(team.id);
    if (activeMembers.length >= format.maxRosterSize) {
      await transaction(async (client) => {
        await this.inviteRepo.markStatus(invite.id, 'expired', client);
      });
      throw new ConflictError('TEAM_AT_MAX_ROSTER');
    }

    return await transaction(async (client) => {
      const member = await this.memberRepo.create(
        {
          teamId: team.id,
          userId,
          gameId: team.gameId,
          formatId: team.formatId,
          divisionId: team.divisionId,
          isCaptain: false,
          position: invite.position,
          shirtNumber: invite.shirtNumber,
        },
        client,
      );
      await this.inviteRepo.markStatus(invite.id, 'accepted', client);
      return member;
    });
  }

  async declineInvite(inviteId: string, userId: string): Promise<void> {
    const invite = await this.inviteRepo.findById(inviteId);
    if (!invite) throw new NotFoundError('Invite');
    if (invite.invitedUserId !== userId) throw new AuthorizationError('INVITE_NOT_FOR_USER');
    if (invite.status !== 'pending') throw new ConflictError('INVITE_NOT_PENDING');

    await transaction(async (client) => {
      await this.inviteRepo.markStatus(invite.id, 'declined', client);
    });
  }

  async cancelInvite(inviteId: string, captainUserId: string): Promise<void> {
    const invite = await this.inviteRepo.findById(inviteId);
    if (!invite) throw new NotFoundError('Invite');
    const team = await this.teamRepo.findById(invite.teamId);
    if (!team || team.captainId !== captainUserId) throw new AuthorizationError('NOT_TEAM_CAPTAIN');
    if (invite.status !== 'pending') throw new ConflictError('INVITE_NOT_PENDING');

    await transaction(async (client) => {
      await this.inviteRepo.markStatus(invite.id, 'cancelled', client);
    });
  }

  // ─── leave / release / transfer / disband ─────────────────────────────────

  async leaveTeam(teamId: string, userId: string): Promise<void> {
    const team = await this.requireActiveTeam(teamId);
    const member = await this.memberRepo.findByTeamAndUser(team.id, userId);
    if (!member) throw new NotFoundError('TeamMember');
    if (member.isCaptain) throw new ValidationError('CAPTAIN_CANNOT_LEAVE_WITHOUT_TRANSFER');

    await transaction(async (client) => {
      await this.memberRepo.release(member.id, 'left', client);
    });
  }

  async releaseMember(teamId: string, userId: string, byUserId: string): Promise<void> {
    const team = await this.requireActiveTeam(teamId);
    if (team.captainId !== byUserId) throw new AuthorizationError('NOT_TEAM_CAPTAIN');

    const member = await this.memberRepo.findByTeamAndUser(team.id, userId);
    if (!member) throw new NotFoundError('TeamMember');
    if (member.isCaptain) throw new ValidationError('CANNOT_RELEASE_CAPTAIN');

    await transaction(async (client) => {
      await this.memberRepo.release(member.id, 'released_by_captain', client);
    });
  }

  async transferCaptaincy(
    teamId: string,
    newCaptainUserId: string,
    currentCaptainUserId: string,
  ): Promise<void> {
    const team = await this.requireActiveTeam(teamId);
    if (team.captainId !== currentCaptainUserId) throw new AuthorizationError('NOT_TEAM_CAPTAIN');
    if (team.captainId === newCaptainUserId) throw new ValidationError('NEW_CAPTAIN_IS_CURRENT_CAPTAIN');

    const newCaptain = await this.memberRepo.findByTeamAndUser(team.id, newCaptainUserId);
    if (!newCaptain) throw new ValidationError('NEW_CAPTAIN_NOT_ON_TEAM');

    if (team.divisionId) {
      const division = await this.fetchDivision(team.divisionId);
      const newCaptainUser = await this.fetchUser(newCaptainUserId);
      if (!newCaptainUser) throw new NotFoundError('User');
      if (division && !this.genderMatchesDivision(newCaptainUser.gender ?? null, division.genderRestriction)) {
        throw new ValidationError('NEW_CAPTAIN_GENDER_MISMATCH');
      }
    }

    await transaction(async (client) => {
      // Order matters: clear old captain flag first so the partial unique index on
      // (teamId, isCaptain=true, releasedAt IS NULL) doesn't trip.
      await this.memberRepo.setCaptainFlag(team.id, currentCaptainUserId, false, client);
      await this.memberRepo.setCaptainFlag(team.id, newCaptainUserId, true, client);
      await this.teamRepo.setCaptain(team.id, newCaptainUserId, client);
    });
  }

  async disbandTeam(teamId: string, captainUserId: string, _reason?: string): Promise<void> {
    const team = await this.requireActiveTeam(teamId);
    if (team.captainId !== captainUserId) throw new AuthorizationError('NOT_TEAM_CAPTAIN');

    await transaction(async (client) => {
      await this.teamRepo.disband(team.id, client);
      await this.memberRepo.releaseAllForTeam(team.id, 'team_disbanded', client);
      await this.inviteRepo.cancelAllPendingForTeam(team.id, client);
      await this.logRepo.recordDisband(captainUserId, team.gameId, team.id, client);
    });
  }

  // ─── update team / member ─────────────────────────────────────────────────

  async updateTeam(
    teamId: string,
    partial: { name?: string; nameAr?: string; city?: string; primaryColor?: string; badgeFileId?: string },
    byUserId: string,
  ): Promise<Team> {
    const team = await this.requireActiveTeam(teamId);
    if (team.captainId !== byUserId) throw new AuthorizationError('NOT_TEAM_CAPTAIN');
    return this.teamRepo.update(team.id, partial);
  }

  async updateMember(
    teamId: string,
    userId: string,
    partial: { position?: string; shirtNumber?: number },
    byUserId: string,
  ): Promise<TeamMember> {
    const team = await this.requireActiveTeam(teamId);
    const member = await this.memberRepo.findByTeamAndUser(team.id, userId);
    if (!member) throw new NotFoundError('TeamMember');

    const isCaptain = team.captainId === byUserId;
    const isSelf = userId === byUserId;
    if (!isCaptain && !isSelf) throw new AuthorizationError('NOT_PERMITTED_TO_UPDATE_MEMBER');

    return this.memberRepo.update(member.id, partial);
  }

  // ─── reads ────────────────────────────────────────────────────────────────

  async getTeam(teamId: string): Promise<{ team: Team; members: TeamMember[] }> {
    const team = await this.teamRepo.findById(teamId);
    if (!team) throw new NotFoundError('Team');
    const members = await this.memberRepo.findActiveMembersByTeam(team.id);
    return { team, members };
  }

  async getMyTeams(userId: string): Promise<Array<{ team: Team; member: TeamMember }>> {
    // Pull active memberships, then load each team.
    const memberships = await query<TeamMember>(
      `SELECT * FROM "teamMembers" WHERE "userId" = :userId AND "releasedAt" IS NULL`,
      { userId },
    );
    const result: Array<{ team: Team; member: TeamMember }> = [];
    for (const m of memberships) {
      const t = await this.teamRepo.findById(m.teamId);
      if (t) result.push({ team: t, member: m });
    }
    return result;
  }

  async getMyInvites(userId: string): Promise<TeamInvite[]> {
    return this.inviteRepo.findPendingForUser(userId);
  }

  async getTeamInvites(teamId: string, byCaptainUserId: string): Promise<TeamInvite[]> {
    const team = await this.teamRepo.findById(teamId);
    if (!team) throw new NotFoundError('Team');
    if (team.captainId !== byCaptainUserId) throw new AuthorizationError('NOT_TEAM_CAPTAIN');
    return this.inviteRepo.findPendingByTeam(team.id);
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  private async requireActiveTeam(teamId: string): Promise<Team> {
    const team = await this.teamRepo.findById(teamId);
    if (!team) throw new NotFoundError('Team');
    if (team.status !== 'active') throw new ValidationError('TEAM_NOT_ACTIVE');
    return team;
  }

  private genderMatchesDivision(
    userGender: 'male' | 'female' | 'prefer_not_say' | null,
    restriction: 'male' | 'female' | 'mixed' | null,
  ): boolean {
    if (!restriction) return true;
    if (restriction === 'mixed') return true;
    return userGender === restriction;
  }

  private async generateUniqueSlug(gameId: string, name: string): Promise<string> {
    const base = name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'team';

    let slug = base;
    let suffix = 2;
    // Bounded loop — slug collisions in practice are rare.
    while (await this.teamRepo.findBySlug(gameId, slug)) {
      slug = `${base}-${suffix}`;
      suffix += 1;
      if (suffix > 1000) throw new AppError('Could not generate unique team slug', 500);
    }
    return slug;
  }

  // The team domain reads game/format/division/user metadata. Phase 4+ might centralize
  // these in their own domains; for Phase 3 we read directly to avoid premature abstraction.
  private async fetchGame(id: string): Promise<GameRow | null> {
    const [row] = await query<GameRow>(
      `SELECT id, slug, "participantType", "isActive" FROM games WHERE id = :id`,
      { id },
    );
    return row ?? null;
  }

  private async fetchFormat(id: string): Promise<FormatRow | null> {
    const [row] = await query<FormatRow>(
      `SELECT id, "gameId", "minRosterSize", "maxRosterSize", "isActive"
       FROM "gameFormats" WHERE id = :id`,
      { id },
    );
    return row ?? null;
  }

  private async fetchActiveDivisions(gameId: string): Promise<DivisionRow[]> {
    return query<DivisionRow>(
      `SELECT id, "gameId", "genderRestriction", "isActive"
       FROM divisions WHERE "gameId" = :gameId AND "isActive" = true`,
      { gameId },
    );
  }

  private async fetchDivision(id: string): Promise<DivisionRow | null> {
    const [row] = await query<DivisionRow>(
      `SELECT id, "gameId", "genderRestriction", "isActive" FROM divisions WHERE id = :id`,
      { id },
    );
    return row ?? null;
  }

  private async fetchUser(id: string): Promise<UserRow | null> {
    const [row] = await query<UserRow>(
      `SELECT id, gender, "experienceLevel" FROM "user" WHERE id = :id`,
      { id },
    );
    return row ?? null;
  }
}
