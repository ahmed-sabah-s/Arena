import type { CustomClient } from '../../db.js';
import type {
  Team,
  TeamMember,
  TeamInvite,
  TeamMemberReleaseReason,
  TeamInviteStatus,
} from './team.entity.js';

export interface CreateTeamData {
  gameId: string;
  formatId: string;
  divisionId: string | null;
  captainId: string;
  name: string;
  nameAr?: string | null;
  slug: string;
  city?: string | null;
  primaryColor?: string | null;
}

export interface CreateTeamMemberData {
  teamId: string;
  userId: string;
  gameId: string;
  formatId: string;
  divisionId: string | null;
  isCaptain: boolean;
  position?: string | null;
  shirtNumber?: number | null;
}

export interface CreateTeamInviteData {
  teamId: string;
  invitedUserId: string;
  invitedByUserId: string;
  position?: string | null;
  shirtNumber?: number | null;
  message?: string | null;
  expiresAt: Date;
}

export interface ITeamRepository {
  create(input: CreateTeamData, client?: CustomClient): Promise<Team>;
  findById(id: string): Promise<Team | null>;
  findBySlug(gameId: string, slug: string): Promise<Team | null>;
  findManyByCaptain(userId: string, gameId?: string): Promise<Team[]>;
  findActiveByScope(gameId: string, formatId: string, divisionId: string | null): Promise<Team[]>;
  update(id: string, partial: Partial<Team>, client?: CustomClient): Promise<Team>;
  disband(id: string, client: CustomClient): Promise<void>;
  setCaptain(teamId: string, newCaptainUserId: string, client: CustomClient): Promise<void>;
}

export interface ITeamMemberRepository {
  create(input: CreateTeamMemberData, client?: CustomClient): Promise<TeamMember>;
  findById(id: string): Promise<TeamMember | null>;
  findByTeamAndUser(teamId: string, userId: string): Promise<TeamMember | null>;
  findActiveMembersByTeam(teamId: string): Promise<TeamMember[]>;
  findActiveByUserAndScope(
    userId: string,
    gameId: string,
    formatId: string,
    divisionId: string | null,
  ): Promise<TeamMember | null>;
  release(id: string, reason: TeamMemberReleaseReason, client: CustomClient): Promise<void>;
  releaseAllForTeam(teamId: string, reason: TeamMemberReleaseReason, client: CustomClient): Promise<void>;
  setCaptainFlag(teamId: string, userId: string, isCaptain: boolean, client: CustomClient): Promise<void>;
  update(id: string, partial: Partial<TeamMember>, client?: CustomClient): Promise<TeamMember>;
}

export interface ITeamInviteRepository {
  create(input: CreateTeamInviteData, client?: CustomClient): Promise<TeamInvite>;
  findById(id: string): Promise<TeamInvite | null>;
  findPendingForUser(userId: string): Promise<TeamInvite[]>;
  findPendingByTeam(teamId: string): Promise<TeamInvite[]>;
  findExistingPending(teamId: string, invitedUserId: string): Promise<TeamInvite | null>;
  markStatus(id: string, status: TeamInviteStatus, client: CustomClient): Promise<void>;
  cancelAllPendingForTeam(teamId: string, client: CustomClient): Promise<void>;
}

export interface ITeamCreationLogRepository {
  recordCreate(userId: string, gameId: string, teamId: string, client: CustomClient): Promise<void>;
  recordDisband(userId: string, gameId: string, teamId: string, client: CustomClient): Promise<void>;
  countCreatesInWindow(userId: string, gameId: string, daysAgo: number): Promise<number>;
  findMostRecentDisband(userId: string, gameId: string): Promise<Date | null>;
}
