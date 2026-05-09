import { describe, it, expect } from 'vitest';
import { checkAvailability, parseTimeToSeconds } from './venue.availability.js';
import type { VenueAvailabilityBlackout, VenueAvailabilityRule } from './venue.entity.js';

const VENUE = 'v-1';

function rule(overrides: Partial<VenueAvailabilityRule>): VenueAvailabilityRule {
  return {
    id: `r-${overrides.id ?? '1'}`,
    venueId: VENUE,
    dayOfWeek: 0,
    openTime: '16:00:00',
    closeTime: '22:00:00',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function blackout(startsAt: Date, endsAt: Date): VenueAvailabilityBlackout {
  return {
    id: 'bo-1', venueId: VENUE,
    startsAt, endsAt, reason: 'maintenance',
    createdByUserId: 'u-1', createdAt: new Date(),
  };
}

// 2026-05-10 is a Sunday (DOW=0).
const SUNDAY_18_00 = new Date(Date.UTC(2026, 4, 10, 18, 0, 0));
const SUNDAY_15_59 = new Date(Date.UTC(2026, 4, 10, 15, 59, 0));
const SUNDAY_22_00 = new Date(Date.UTC(2026, 4, 10, 22, 0, 0));
const MONDAY_18_00 = new Date(Date.UTC(2026, 4, 11, 18, 0, 0));

describe('parseTimeToSeconds', () => {
  it('parses HH:mm', () => expect(parseTimeToSeconds('14:30')).toBe(14 * 3600 + 30 * 60));
  it('parses HH:mm:ss', () => expect(parseTimeToSeconds('09:00:30')).toBe(9 * 3600 + 30));
  it('handles leading zeros', () => expect(parseTimeToSeconds('00:05')).toBe(300));
});

describe('checkAvailability', () => {
  it('open inside an active rule window', () => {
    const result = checkAvailability(SUNDAY_18_00, [rule({ dayOfWeek: 0 })], []);
    expect(result.isOpen).toBe(true);
  });

  it('open at exactly openTime (inclusive start)', () => {
    const result = checkAvailability(
      new Date(Date.UTC(2026, 4, 10, 16, 0, 0)),
      [rule({ dayOfWeek: 0, openTime: '16:00:00', closeTime: '22:00:00' })],
      [],
    );
    expect(result.isOpen).toBe(true);
  });

  it('closed at exactly closeTime (exclusive end)', () => {
    const result = checkAvailability(
      SUNDAY_22_00,
      [rule({ dayOfWeek: 0, openTime: '16:00:00', closeTime: '22:00:00' })],
      [],
    );
    expect(result.isOpen).toBe(false);
    expect(result.reason).toBe('outside_hours');
  });

  it('outside_hours when timestamp is before openTime', () => {
    const result = checkAvailability(
      SUNDAY_15_59,
      [rule({ dayOfWeek: 0, openTime: '16:00:00', closeTime: '22:00:00' })],
      [],
    );
    expect(result.isOpen).toBe(false);
    expect(result.reason).toBe('outside_hours');
  });

  it('no_rule_for_day when day-of-week has no active rules', () => {
    const result = checkAvailability(MONDAY_18_00, [rule({ dayOfWeek: 0 })], []);
    expect(result.isOpen).toBe(false);
    expect(result.reason).toBe('no_rule_for_day');
  });

  it('open if inside ANY rule on a split-shift day', () => {
    const morning = rule({ id: 'm', dayOfWeek: 0, openTime: '09:00', closeTime: '13:00' });
    const evening = rule({ id: 'e', dayOfWeek: 0, openTime: '16:00', closeTime: '22:00' });
    const t1100 = new Date(Date.UTC(2026, 4, 10, 11, 0, 0));
    const t14_30 = new Date(Date.UTC(2026, 4, 10, 14, 30, 0));
    expect(checkAvailability(t1100, [morning, evening], []).isOpen).toBe(true);
    expect(checkAvailability(t14_30, [morning, evening], []).isOpen).toBe(false);
    expect(checkAvailability(SUNDAY_18_00, [morning, evening], []).isOpen).toBe(true);
  });

  it('blackout overrides an open rule window', () => {
    const bo = blackout(
      new Date(Date.UTC(2026, 4, 10, 17, 0, 0)),
      new Date(Date.UTC(2026, 4, 10, 19, 0, 0)),
    );
    const result = checkAvailability(SUNDAY_18_00, [rule({ dayOfWeek: 0 })], [bo]);
    expect(result.isOpen).toBe(false);
    expect(result.reason).toBe('blackout');
  });

  it('inactive rules are ignored', () => {
    const result = checkAvailability(
      SUNDAY_18_00,
      [rule({ dayOfWeek: 0, isActive: false })],
      [],
    );
    expect(result.isOpen).toBe(false);
    expect(result.reason).toBe('no_rule_for_day');
  });
});
