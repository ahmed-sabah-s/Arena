import { query } from '../../db.js';
import type { CustomClient } from '../../db.js';
import { AppError, NotFoundError } from '../../shared/errors/index.js';
import type { MatchInvite, MatchInviteStatus } from './match-invite.entity.js';
import type { CreateMatchInviteData, IMatchInviteRepository } from './match-invite.interface.js';

export class MatchInviteRepository implements IMatchInviteRepository {
  async create(input: CreateMatchInviteData): Promise<MatchInvite> {
    const [row] = await query<MatchInvite>(
      `INSERT INTO "matchInvites" (
         code, "qrPayload", "createdByUserId", "creatorTeamId",
         "gameId", "formatId", "divisionId",
         stakes, "matchMode", "venueId", "expiresAt"
       )
       VALUES (
         :code, :qrPayload, :createdByUserId, :creatorTeamId,
         :gameId, :formatId, :divisionId,
         :stakes, :matchMode, :venueId, :expiresAt
       )
       RETURNING *`,
      { ...input },
    );
    if (!row) throw new AppError('Failed to create match invite', 500);
    return row;
  }

  async findById(id: string): Promise<MatchInvite | null> {
    const [row] = await query<MatchInvite>(
      `SELECT * FROM "matchInvites" WHERE id = :id`, { id },
    );
    return row ?? null;
  }

  async findByCode(code: string): Promise<MatchInvite | null> {
    const [row] = await query<MatchInvite>(
      `SELECT * FROM "matchInvites" WHERE code = :code`, { code },
    );
    return row ?? null;
  }

  async findByIdForUpdate(id: string, client: CustomClient): Promise<MatchInvite | null> {
    const res = await client.query<MatchInvite>(
      `SELECT * FROM "matchInvites" WHERE id = :id FOR UPDATE`, { id },
    );
    return res.rows[0] ?? null;
  }

  async setStatus(id: string, status: MatchInviteStatus, client: CustomClient): Promise<MatchInvite> {
    const res = await client.query<MatchInvite>(
      `UPDATE "matchInvites" SET status = :status WHERE id = :id RETURNING *`,
      { id, status },
    );
    if (!res.rows[0]) throw new NotFoundError('MatchInvite');
    return res.rows[0];
  }

  async setClaimed(
    id: string,
    claimedByUserId: string,
    claimedByTeamId: string | null,
    client: CustomClient,
  ): Promise<MatchInvite> {
    const res = await client.query<MatchInvite>(
      `UPDATE "matchInvites"
       SET status = 'claimed',
           "claimedByUserId" = :claimedByUserId,
           "claimedByTeamId" = :claimedByTeamId,
           "claimedAt" = CURRENT_TIMESTAMP
       WHERE id = :id RETURNING *`,
      { id, claimedByUserId, claimedByTeamId },
    );
    if (!res.rows[0]) throw new NotFoundError('MatchInvite');
    return res.rows[0];
  }

  async setCreatorConfirmed(id: string, matchId: string, client: CustomClient): Promise<MatchInvite> {
    const res = await client.query<MatchInvite>(
      `UPDATE "matchInvites"
       SET "creatorConfirmedAt" = CURRENT_TIMESTAMP, "matchId" = :matchId
       WHERE id = :id RETURNING *`,
      { id, matchId },
    );
    if (!res.rows[0]) throw new NotFoundError('MatchInvite');
    return res.rows[0];
  }

  async findExpiringPast(): Promise<MatchInvite[]> {
    return query<MatchInvite>(
      `SELECT * FROM "matchInvites"
       WHERE status IN ('open', 'claimed') AND "expiresAt" < CURRENT_TIMESTAMP`,
    );
  }
}
