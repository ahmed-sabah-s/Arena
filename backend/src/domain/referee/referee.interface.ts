import type { CustomClient } from '../../db.js';
import type {
  RefereeAssignment,
  RefereeAssignmentRole,
  RefereeAssignmentStatus,
  RefereeCaptainFlag,
  RefereeCertification,
  RefereeConflict,
  RefereeFlagReason,
  RefereeProfile,
} from './referee.entity.js';
import type { MatchSide } from '../match/match.entity.js';

export interface UpdateRefereeProfileData {
  bio?: string | null;
  baseCity?: string | null;
  isAcceptingAssignments?: boolean;
}

export type ProfileCounter = 'totalMatchesOfficiated' | 'totalNoShows' | 'totalCaptainFlags';

export interface IRefereeProfileRepository {
  create(userId: string, client?: CustomClient): Promise<RefereeProfile>;
  findByUserId(userId: string, client?: CustomClient): Promise<RefereeProfile | null>;
  findByUserIdForUpdate(userId: string, client: CustomClient): Promise<RefereeProfile | null>;
  update(userId: string, partial: UpdateRefereeProfileData, client?: CustomClient): Promise<RefereeProfile>;
  incrementCounter(userId: string, counter: ProfileCounter, client: CustomClient): Promise<void>;
  applyReliabilityDelta(userId: string, delta: number, client: CustomClient): Promise<RefereeProfile>;
  setLastOfficiatedAt(userId: string, when: Date, client: CustomClient): Promise<void>;
}

export interface CreateCertificationData {
  userId: string;
  gameId: string;
  certifiedByUserId: string;
  notes?: string | null;
}

export interface IRefereeCertificationRepository {
  create(input: CreateCertificationData, client?: CustomClient): Promise<RefereeCertification>;
  findActiveByUser(userId: string): Promise<RefereeCertification[]>;
  findActiveByGame(gameId: string): Promise<RefereeCertification[]>;
  findActiveByUserAndGame(userId: string, gameId: string): Promise<RefereeCertification | null>;
  revoke(id: string, byUserId: string, reason: string, client?: CustomClient): Promise<RefereeCertification>;
  userIsCertifiedFor(userId: string, gameId: string): Promise<boolean>;
}

export interface DeclareConflictData {
  refereeUserId: string;
  conflictedTeamId: string | null;
  conflictedUserId: string | null;
  reason: string | null;
}

export interface IRefereeConflictRepository {
  declare(input: DeclareConflictData, client?: CustomClient): Promise<RefereeConflict>;
  findById(id: string): Promise<RefereeConflict | null>;
  findActiveByReferee(refereeUserId: string): Promise<RefereeConflict[]>;
  removeConflict(id: string, client?: CustomClient): Promise<RefereeConflict>;
  hasConflict(
    refereeUserId: string,
    teamIds: string[],
    userIds: string[],
  ): Promise<boolean>;
}

export interface CreateAssignmentData {
  matchId: string;
  refereeUserId: string;
  role: RefereeAssignmentRole;
  assignedByUserId: string;
}

export interface IRefereeAssignmentRepository {
  create(input: CreateAssignmentData, client?: CustomClient): Promise<RefereeAssignment>;
  findById(id: string, client?: CustomClient): Promise<RefereeAssignment | null>;
  findByIdForUpdate(id: string, client: CustomClient): Promise<RefereeAssignment | null>;
  findByMatch(matchId: string, client?: CustomClient): Promise<RefereeAssignment[]>;
  findActiveMainByMatch(matchId: string, client?: CustomClient): Promise<RefereeAssignment | null>;
  findActiveAssistantsByMatch(matchId: string, client?: CustomClient): Promise<RefereeAssignment[]>;
  findActiveAssignmentForReferee(
    matchId: string,
    refereeUserId: string,
    client?: CustomClient,
  ): Promise<RefereeAssignment | null>;
  updateStatus(
    id: string,
    status: RefereeAssignmentStatus,
    client: CustomClient,
    extra?: { respondedAt?: Date; checkedInAt?: Date; declineReason?: string | null },
  ): Promise<RefereeAssignment>;
  promoteToMain(
    id: string,
    promotedFromAssignmentId: string,
    client: CustomClient,
  ): Promise<RefereeAssignment>;
  demoteToAssistant(id: string, client: CustomClient): Promise<RefereeAssignment>;
  countOfficiatedTeamMatchesInWindow(
    refereeUserId: string,
    teamId: string,
    sinceDays: number,
  ): Promise<number>;
  countNoShowsInWindow(refereeUserId: string, sinceDays: number): Promise<number>;
}

export interface CreateCaptainFlagData {
  matchId: string;
  refereeUserId: string;
  flaggedByUserId: string;
  flaggedBySide: MatchSide;
  reason: RefereeFlagReason;
  description: string | null;
}

export interface IRefereeCaptainFlagRepository {
  create(input: CreateCaptainFlagData, client?: CustomClient): Promise<RefereeCaptainFlag>;
  findByReferee(refereeUserId: string): Promise<RefereeCaptainFlag[]>;
  findOpenByMatch(matchId: string): Promise<RefereeCaptainFlag[]>;
  countByRefereeInWindow(refereeUserId: string, sinceDays: number, client?: CustomClient): Promise<number>;
}
