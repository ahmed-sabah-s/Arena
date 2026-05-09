import { describe, it, expect } from 'vitest';
import { calculateCommission } from './venue-booking.commission.js';
import type { Currency } from '@arena/shared';

const IQD: Currency = {
  code: 'IQD',
  name: 'Iraqi Dinar',
  nameAr: 'دينار',
  symbol: 'ع.د',
  subunitFactor: 1,
  displayRoundingStep: 250,
  displayRoundingMode: 'ceil',
  isActive: true,
};

const USD: Currency = {
  code: 'USD',
  name: 'US Dollar',
  nameAr: 'دولار',
  symbol: '$',
  subunitFactor: 100,
  displayRoundingStep: 1,
  displayRoundingMode: 'ceil',
  isActive: false,
};

describe('calculateCommission — IQD (step 250, ceil)', () => {
  it('47390 IQD * 8% rounds raw 3791.20 up to 4000', () => {
    const r = calculateCommission({ priceAmount: 47390, commissionPercent: 8.0, currency: IQD });
    expect(r.rawCommission).toBeCloseTo(3791.2);
    expect(r.roundedCommission).toBe(4000);
    expect(r.ownerPayout).toBe(43390);
  });

  it('50000 IQD * 8% lands cleanly on 4000', () => {
    const r = calculateCommission({ priceAmount: 50000, commissionPercent: 8.0, currency: IQD });
    expect(r.rawCommission).toBe(4000);
    expect(r.roundedCommission).toBe(4000);
    expect(r.ownerPayout).toBe(46000);
  });

  it('30000 IQD * 8% rounds 2400 up to 2500', () => {
    const r = calculateCommission({ priceAmount: 30000, commissionPercent: 8.0, currency: IQD });
    expect(r.roundedCommission).toBe(2500);
    expect(r.ownerPayout).toBe(27500);
  });

  it('zero priceAmount produces zero everything', () => {
    const r = calculateCommission({ priceAmount: 0, commissionPercent: 8.0, currency: IQD });
    expect(r.rawCommission).toBe(0);
    expect(r.roundedCommission).toBe(0);
    expect(r.ownerPayout).toBe(0);
  });

  it('zero commissionPercent leaves the full amount with the owner', () => {
    const r = calculateCommission({ priceAmount: 10000, commissionPercent: 0, currency: IQD });
    expect(r.roundedCommission).toBe(0);
    expect(r.ownerPayout).toBe(10000);
  });

  it('handles a very large price within JS safe integer range', () => {
    const r = calculateCommission({ priceAmount: 1_000_000_000, commissionPercent: 8.0, currency: IQD });
    expect(r.rawCommission).toBe(80_000_000);
    expect(r.roundedCommission).toBe(80_000_000);
    expect(r.ownerPayout).toBe(920_000_000);
  });
});

describe('calculateCommission — USD (step 1, ceil cents)', () => {
  it('4789 cents * 8% = 383.12 raw, 384 rounded', () => {
    const r = calculateCommission({ priceAmount: 4789, commissionPercent: 8.0, currency: USD });
    expect(r.rawCommission).toBeCloseTo(383.12);
    expect(r.roundedCommission).toBe(384);
    expect(r.ownerPayout).toBe(4405);
  });
});

describe('calculateCommission — currency with floor mode', () => {
  it('respects displayRoundingMode=floor', () => {
    const FLOOR_CURRENCY: Currency = { ...IQD, displayRoundingMode: 'floor' };
    const r = calculateCommission({
      priceAmount: 47390, commissionPercent: 8.0, currency: FLOOR_CURRENCY,
    });
    // raw 3791.20 floored to next 250 = 3750.
    expect(r.roundedCommission).toBe(3750);
    expect(r.ownerPayout).toBe(43640);
  });
});
