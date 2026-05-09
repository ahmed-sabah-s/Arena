import type {
  VenueAvailabilityBlackout,
  VenueAvailabilityRule,
} from './venue.entity.js';

export type AvailabilityReason =
  | 'blackout'
  | 'no_rule_for_day'
  | 'outside_hours';

export interface AvailabilityCheck {
  isOpen: boolean;
  reason?: AvailabilityReason;
}

/**
 * Compute whether a venue is open at the given timestamp.
 *
 * Order of checks:
 *  1. Active blackout overlapping the timestamp → closed (`blackout`).
 *  2. No active rule for the day → closed (`no_rule_for_day`).
 *  3. Time falls inside any active rule's `[openTime, closeTime)` → open.
 *  4. Otherwise closed (`outside_hours`).
 *
 * Times are compared as seconds-since-midnight in UTC. The caller is
 * responsible for handing in a timestamp that already represents the
 * venue-local wall-clock time (Phase 7 doesn't model timezones — the
 * Iraq market is single-zone Asia/Baghdad and all timestamps in the
 * platform are stored as TIMESTAMP without tz, interpreted as wall-time).
 */
export function checkAvailability(
  timestamp: Date,
  rules: VenueAvailabilityRule[],
  blackouts: VenueAvailabilityBlackout[],
): AvailabilityCheck {
  // 1. Blackout wins.
  for (const b of blackouts) {
    if (timestamp >= b.startsAt && timestamp < b.endsAt) {
      return { isOpen: false, reason: 'blackout' };
    }
  }

  // 2. Find active rules for this day-of-week.
  const dow = timestamp.getUTCDay(); // Postgres EXTRACT(DOW) matches getUTCDay()
  const dayRules = rules.filter((r) => r.isActive && r.dayOfWeek === dow);
  if (dayRules.length === 0) return { isOpen: false, reason: 'no_rule_for_day' };

  // 3. Check whether the timestamp's wall-clock time falls inside any rule.
  const seconds = timestampSeconds(timestamp);
  for (const rule of dayRules) {
    const open = parseTimeToSeconds(rule.openTime);
    const close = parseTimeToSeconds(rule.closeTime);
    if (seconds >= open && seconds < close) return { isOpen: true };
  }
  return { isOpen: false, reason: 'outside_hours' };
}

function timestampSeconds(d: Date): number {
  return d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds();
}

/** Parse 'HH:mm' or 'HH:mm:ss' to seconds-since-midnight. */
export function parseTimeToSeconds(time: string): number {
  const parts = time.split(':');
  const h = Number.parseInt(parts[0] ?? '0', 10);
  const m = Number.parseInt(parts[1] ?? '0', 10);
  const s = parts[2] ? Number.parseInt(parts[2], 10) : 0;
  return h * 3600 + m * 60 + s;
}
