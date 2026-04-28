import type { CustomClient } from '../../db.js';
import type { TeamElo, PlayerElo } from './elo.entity.js';

export interface CreateTeamEloData {
  teamId: string;
  gameId: string;
  formatId: string;
  divisionId: string | null;
  seasonId: string | null;
  elo: number;
  mmr: number;
}

export interface CreatePlayerEloData {
  userId: string;
  gameId: string;
  formatId: string;
  divisionId: string | null;
  seasonId: string | null;
  elo: number;
  mmr: number;
}

export interface ITeamEloRepository {
  create(input: CreateTeamEloData, client?: CustomClient): Promise<TeamElo>;
  findById(id: string): Promise<TeamElo | null>;
  findByTeam(
    teamId: string,
    gameId: string,
    formatId: string,
    divisionId: string | null,
    seasonId: string | null,
  ): Promise<TeamElo | null>;
  findManyByTeam(teamId: string): Promise<TeamElo[]>;
  findLeaderboard(
    gameId: string,
    formatId: string,
    divisionId: string | null,
    limit: number,
    offset: number,
  ): Promise<TeamElo[]>;
  update(id: string, partial: Partial<TeamElo>, client: CustomClient): Promise<TeamElo>;
}

export interface IPlayerEloRepository {
  create(input: CreatePlayerEloData, client?: CustomClient): Promise<PlayerElo>;
  findById(id: string): Promise<PlayerElo | null>;
  findByUser(
    userId: string,
    gameId: string,
    formatId: string,
    divisionId: string | null,
    seasonId: string | null,
  ): Promise<PlayerElo | null>;
  findManyByUser(userId: string): Promise<PlayerElo[]>;
  findLeaderboard(
    gameId: string,
    formatId: string,
    divisionId: string | null,
    limit: number,
    offset: number,
  ): Promise<PlayerElo[]>;
  update(id: string, partial: Partial<PlayerElo>, client: CustomClient): Promise<PlayerElo>;
}
