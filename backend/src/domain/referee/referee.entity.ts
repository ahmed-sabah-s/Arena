import type { MatchSide } from '../match/match.entity.js';

export type RefereeAssignmentRole = 'main' | 'assistant';

export type RefereeAssignmentStatus =
  | 'assigned'
  | 'accepted'
  | 'declined'
  | 'checked_in'
  | 'no_show'
  | 'promoted'
  | 'completed'
  | 'cancelled';

export type RefereeFlagReason =
  | 'bias_toward_opponent'
  | 'incorrect_calls'
  | 'aggressive_behavior'
  | 'inattention'
  | 'other';

export type RefereeFlagStatus = 'open' | 'reviewed' | 'upheld' | 'dismissed';

export interface RefereeProfile {
  id: string;
  userId: string;
  reliabilityScore: number;
  totalMatchesOfficiated: number;
  totalNoShows: number;
  totalCaptainFlags: number;
  baseCity: string | null;
  isAcceptingAssignments: boolean;
  lastOfficiatedAt: Date | null;
  bio: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RefereeCertification {
  id: string;
  userId: string;
  gameId: string;
  certifiedAt: Date;
  certifiedByUserId: string;
  revokedAt: Date | null;
  revokedByUserId: string | null;
  revocationReason: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RefereeConflict {
  id: string;
  refereeUserId: string;
  conflictedTeamId: string | null;
  conflictedUserId: string | null;
  reason: string | null;
  declaredAt: Date;
  removedAt: Date | null;
}

export interface RefereeAssignment {
  id: string;
  matchId: string;
  refereeUserId: string;
  role: RefereeAssignmentRole;
  status: RefereeAssignmentStatus;
  assignedByUserId: string;
  assignedAt: Date;
  respondedAt: Date | null;
  checkedInAt: Date | null;
  promotedAt: Date | null;
  promotedFromAssignmentId: string | null;
  declineReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RefereeCaptainFlag {
  id: string;
  matchId: string;
  refereeUserId: string;
  flaggedByUserId: string;
  flaggedBySide: MatchSide;
  reason: RefereeFlagReason;
  description: string | null;
  status: RefereeFlagStatus;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
}
