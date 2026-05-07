import { describe, it, expect } from 'vitest';
import { reconcileStatLogs } from './match.reconciliation.js';
import type { MatchStatLog } from './match.entity.js';

function makeLog(overrides: Partial<MatchStatLog>): MatchStatLog {
  return {
    id: 'l-?',
    matchId: 'm-1',
    loggedByUserId: 'u-?',
    side: 'A',
    statKey: 'goals',
    statValue: 1,
    minute: null,
    playerId: null,
    recordedAt: new Date(),
    ...overrides,
  };
}

describe('reconcileStatLogs', () => {
  it('two logs from different keepers same event → verified', () => {
    const logs: MatchStatLog[] = [
      makeLog({ id: 'l1', loggedByUserId: 'k1', minute: 23, playerId: 'p1' }),
      makeLog({ id: 'l2', loggedByUserId: 'k2', minute: 24, playerId: 'p1' }),
    ];
    const out = reconcileStatLogs(logs);
    expect(out).toHaveLength(1);
    expect(out[0].stat.verificationStatus).toBe('verified');
    expect(out[0].loggers).toBe(2);
  });

  it('only one keeper logged → unverified', () => {
    const logs = [makeLog({ id: 'l1', loggedByUserId: 'k1', minute: 23, playerId: 'p1' })];
    const out = reconcileStatLogs(logs);
    expect(out[0].stat.verificationStatus).toBe('unverified');
  });

  it('two events from the same keeper at different minutes → two events', () => {
    const logs = [
      makeLog({ id: 'l1', loggedByUserId: 'k1', minute: 10, playerId: 'p1' }),
      makeLog({ id: 'l2', loggedByUserId: 'k1', minute: 50, playerId: 'p1' }),
    ];
    const out = reconcileStatLogs(logs);
    expect(out).toHaveLength(2);
    expect(out.every((e) => e.stat.verificationStatus === 'unverified')).toBe(true);
  });

  it('different sides do not merge even with same key/minute', () => {
    const logs = [
      makeLog({ id: 'l1', loggedByUserId: 'k1', minute: 30, playerId: 'p1', side: 'A' }),
      makeLog({ id: 'l2', loggedByUserId: 'k2', minute: 30, playerId: 'p1', side: 'B' }),
    ];
    const out = reconcileStatLogs(logs);
    expect(out).toHaveLength(2);
  });

  it('different stat keys do not merge', () => {
    const logs = [
      makeLog({ id: 'l1', loggedByUserId: 'k1', minute: 30, playerId: 'p1', statKey: 'goals' }),
      makeLog({ id: 'l2', loggedByUserId: 'k2', minute: 30, playerId: 'p1', statKey: 'assists' }),
    ];
    const out = reconcileStatLogs(logs);
    expect(out).toHaveLength(2);
  });

  it('different playerIds do not merge (same minute)', () => {
    const logs = [
      makeLog({ id: 'l1', loggedByUserId: 'k1', minute: 30, playerId: 'p1' }),
      makeLog({ id: 'l2', loggedByUserId: 'k2', minute: 30, playerId: 'p2' }),
    ];
    const out = reconcileStatLogs(logs);
    expect(out).toHaveLength(2);
  });

  it('logs more than 2 minutes apart from different keepers do NOT merge', () => {
    const logs = [
      makeLog({ id: 'l1', loggedByUserId: 'k1', minute: 30, playerId: 'p1' }),
      makeLog({ id: 'l2', loggedByUserId: 'k2', minute: 33, playerId: 'p1' }),
    ];
    const out = reconcileStatLogs(logs);
    expect(out).toHaveLength(2);
    expect(out.every((e) => e.stat.verificationStatus === 'unverified')).toBe(true);
  });

  it('logs within 2 minutes from different keepers DO merge', () => {
    const logs = [
      makeLog({ id: 'l1', loggedByUserId: 'k1', minute: 30, playerId: 'p1' }),
      makeLog({ id: 'l2', loggedByUserId: 'k2', minute: 32, playerId: 'p1' }),
    ];
    const out = reconcileStatLogs(logs);
    expect(out).toHaveLength(1);
    expect(out[0].stat.verificationStatus).toBe('verified');
  });
});
