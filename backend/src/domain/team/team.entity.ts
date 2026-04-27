export type TeamStatus = 'active' | 'disbanded';

export type TeamMemberReleaseReason =
  | 'left'
  | 'released_by_captain'
  | 'team_disbanded'
  | 'admin_action';

export type TeamInviteStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';

export type TeamCreationLogAction = 'created' | 'disbanded';

export interface Team {
  id: string;
  gameId: string;
  formatId: string;
  divisionId: string | null;
  captainId: string;
  name: string;
  nameAr: string | null;
  slug: string;
  city: string | null;
  badgeFileId: string | null;
  primaryColor: string | null;
  status: TeamStatus;
  foundedAt: Date;
  disbandedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  gameId: string;
  formatId: string;
  divisionId: string | null;
  isCaptain: boolean;
  position: string | null;
  shirtNumber: number | null;
  joinedAt: Date;
  releasedAt: Date | null;
  releaseReason: TeamMemberReleaseReason | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamInvite {
  id: string;
  teamId: string;
  invitedUserId: string;
  invitedByUserId: string;
  position: string | null;
  shirtNumber: number | null;
  status: TeamInviteStatus;
  message: string | null;
  createdAt: Date;
  respondedAt: Date | null;
  expiresAt: Date;
}
