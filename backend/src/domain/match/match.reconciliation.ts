/**
 * Stat reconciliation.
 *
 * Each side's stat keeper logs events independently. After the match resolves,
 * we walk both logs and emit one row per logical event into matchStats:
 *  - VERIFIED  — both stat keepers logged a matching event (same side, same
 *                statKey, same playerId, minute within toleranceMinutes).
 *  - UNVERIFIED — only one stat keeper logged the event.
 *
 * verified entries count toward season-leaderboard stats; unverified appear on
 * the match detail page but don't aggregate.
 *
 * The tolerance window is tuned via the
 * `stat_reconciliation_tolerance_minutes` platformConfig key (default 2).
 * The pure functions in this file accept it as a parameter to stay free of
 * config IO; the caller (match.service.resolveAgreedMatch) reads the value
 * via getConfigInteger and passes it through.
 *
 * Phase 6 referee-recorded stats use the same logic but with
 * verificationStatus='referee_recorded'.
 */
import type { CustomClient } from '../../db.js';
import type { MatchSide, MatchStatLog, StatVerificationStatus } from './match.entity.js';
import type { CreateMatchStatData, IMatchStatRepository } from './match.interface.js';

interface ReconciliationGroup {
  side: MatchSide;
  statKey: string;
  playerId: string | null;
  minute: number | null;
  loggers: Set<string>;
  // Pick one log to use as the "canonical" event for storage.
  representative: MatchStatLog;
}

function groupKey(g: { side: MatchSide; statKey: string; playerId: string | null; minute: number | null }): string {
  return `${g.side}|${g.statKey}|${g.playerId ?? 'TEAM'}|${g.minute ?? 'X'}`;
}

/**
 * Group stat logs into events. Two logs merge into one event when they have
 * the same (side, statKey, playerId) and their minutes are within
 * `toleranceMinutes` of each other.
 */
export function reconcileStatLogs(
  logs: MatchStatLog[],
  toleranceMinutes: number,
): Array<{ stat: CreateMatchStatData; loggers: number }> {
  // Sort by minute (nulls last) so close-in-time events anchor early.
  const sorted = [...logs].sort((a, b) => {
    const ma = a.minute ?? Number.POSITIVE_INFINITY;
    const mb = b.minute ?? Number.POSITIVE_INFINITY;
    return ma - mb;
  });

  const groups: ReconciliationGroup[] = [];

  for (const log of sorted) {
    const candidate = groups.find((g) => {
      if (g.side !== log.side) return false;
      if (g.statKey !== log.statKey) return false;
      if ((g.playerId ?? null) !== (log.playerId ?? null)) return false;
      // minute within tolerance (treat null as a hard mismatch unless both null)
      if (g.minute === null && log.minute === null) return true;
      if (g.minute === null || log.minute === null) return false;
      return Math.abs(g.minute - log.minute) <= toleranceMinutes;
    });
    if (candidate) {
      candidate.loggers.add(log.loggedByUserId);
    } else {
      groups.push({
        side: log.side,
        statKey: log.statKey,
        playerId: log.playerId ?? null,
        minute: log.minute ?? null,
        loggers: new Set([log.loggedByUserId]),
        representative: log,
      });
    }
  }

  return groups.map((g) => {
    const verificationStatus: StatVerificationStatus = g.loggers.size >= 2 ? 'verified' : 'unverified';
    const stat: CreateMatchStatData = {
      matchId: g.representative.matchId,
      side: g.side,
      statKey: g.statKey,
      statValue: g.representative.statValue,
      minute: g.minute,
      playerId: g.playerId,
      verificationStatus,
    };
    return { stat, loggers: g.loggers.size };
  });
  // (groupKey is unused at runtime but kept for future debugging/index strategies.)
}

// Surface the helper for testing.
export const __internal = { groupKey };

/**
 * Persist reconciled stats. Caller passes the already-fetched logs, the
 * tolerance window in minutes, and the transaction client so this stays a
 * pure-side-effect-on-the-tx step.
 */
export async function persistReconciledStats(
  logs: MatchStatLog[],
  toleranceMinutes: number,
  statRepo: IMatchStatRepository,
  client: CustomClient,
): Promise<{ verified: number; unverified: number }> {
  const reconciled = reconcileStatLogs(logs, toleranceMinutes);
  let verified = 0;
  let unverified = 0;
  for (const { stat, loggers } of reconciled) {
    await statRepo.create(stat, client);
    if (loggers >= 2) verified += 1;
    else unverified += 1;
  }
  return { verified, unverified };
}
