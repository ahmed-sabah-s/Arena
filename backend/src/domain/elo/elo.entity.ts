import type { FormResult } from '../../shared/elo/index.js';

interface EloBase {
  id: string;
  gameId: string;
  formatId: string;
  divisionId: string | null;
  seasonId: string | null;
  elo: number;
  mmr: number;
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  matchesDrawn: number;
  calibrationCompleteAt: Date | null;
  lastMatchAt: Date | null;
  form: FormResult[];
  highestElo: number;
  highestMmr: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamElo extends EloBase {
  teamId: string;
}

export interface PlayerElo extends EloBase {
  userId: string;
}
