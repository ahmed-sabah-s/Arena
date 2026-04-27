import { describe, it, expect } from 'vitest';
import { roundMoney, roundMoneyForDisplay } from './roundMoney.js';
import type { Currency } from '@arena/shared';

// ─── Test currency fixtures ───────────────────────────────────────────────────

const IQD: Currency = {
  code: 'IQD',
  name: 'Iraqi Dinar',
  nameAr: 'دينار عراقي',
  symbol: 'د.ع',
  subunitFactor: 1,
  displayRoundingStep: 250,
  displayRoundingMode: 'ceil',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const USD: Currency = {
  code: 'USD',
  name: 'US Dollar',
  nameAr: 'دولار أمريكي',
  symbol: '$',
  subunitFactor: 100,
  displayRoundingStep: 1,
  displayRoundingMode: 'ceil',
  isActive: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const JOD: Currency = {
  code: 'JOD',
  name: 'Jordanian Dinar',
  nameAr: 'دينار أردني',
  symbol: 'د.أ',
  subunitFactor: 1000,
  displayRoundingStep: 25,
  displayRoundingMode: 'ceil',
  isActive: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// IQD-shaped currency for mode testing (step=250 like IQD but mode overridden below)
const IQD_NEAREST: Currency = { ...IQD, displayRoundingMode: 'nearest' };
const IQD_FLOOR: Currency = { ...IQD, displayRoundingMode: 'floor' };

// ─── IQD tests (step=250, mode=ceil) ─────────────────────────────────────────

describe('IQD rounding (step=250, ceil)', () => {
  it('rounds 47390 up to 47500', () => {
    expect(roundMoney(47390, IQD)).toBe(47500);
  });

  it('leaves exact multiple 50000 unchanged', () => {
    expect(roundMoney(50000, IQD)).toBe(50000);
  });

  it('leaves exact multiple 47250 unchanged', () => {
    expect(roundMoney(47250, IQD)).toBe(47250);
  });

  it('rounds 1 up to 250', () => {
    expect(roundMoney(1, IQD)).toBe(250);
  });

  it('rounds 0 to 0', () => {
    expect(roundMoney(0, IQD)).toBe(0);
  });

  it('accepts bigint input', () => {
    expect(roundMoney(47390n, IQD)).toBe(47500);
  });
});

// ─── USD tests (step=1, mode=ceil) ───────────────────────────────────────────

describe('USD rounding (step=1, ceil)', () => {
  it('leaves exact cent value 4789 unchanged (step=1 never changes integers)', () => {
    expect(roundMoney(4789, USD)).toBe(4789);
  });

  it('rounds 0.5 cents up to 1', () => {
    // step=1, ceil: Math.ceil(0.5 / 1) * 1 = 1
    expect(roundMoney(0.5, USD)).toBe(1);
  });
});

// ─── JOD tests (step=25 qirsh, mode=ceil) ────────────────────────────────────

describe('JOD rounding (step=25 qirsh, ceil)', () => {
  it('rounds 23 qirsh up to 25', () => {
    expect(roundMoney(23, JOD)).toBe(25);
  });

  it('rounds 124 qirsh up to 125', () => {
    expect(roundMoney(124, JOD)).toBe(125);
  });

  it('leaves exact multiple 100 qirsh unchanged', () => {
    expect(roundMoney(100, JOD)).toBe(100);
  });
});

// ─── mode=nearest ─────────────────────────────────────────────────────────────

describe('nearest rounding (IQD-shaped step=250)', () => {
  it('rounds 47390 to nearest 250 → 47500 (47390 is closer to 47500 than 47250)', () => {
    expect(roundMoney(47390, IQD_NEAREST)).toBe(47500);
  });

  it('rounds 47150 to nearest 250 → 47250 (47150 / 250 = 188.6, rounds to 189 → 47250)', () => {
    expect(roundMoney(47150, IQD_NEAREST)).toBe(47250);
  });
});

// ─── mode=floor ───────────────────────────────────────────────────────────────

describe('floor rounding (IQD-shaped step=250)', () => {
  it('rounds 47390 floor to 47250', () => {
    expect(roundMoney(47390, IQD_FLOOR)).toBe(47250);
  });
});

// ─── alias ────────────────────────────────────────────────────────────────────

describe('roundMoneyForDisplay alias', () => {
  it('behaves identically to roundMoney', () => {
    expect(roundMoneyForDisplay(47390, IQD)).toBe(roundMoney(47390, IQD));
  });
});

// ─── edge: very large numbers ─────────────────────────────────────────────────

describe('edge cases', () => {
  it('rounds a very large number correctly (999_999_999_999 IQD)', () => {
    // 999_999_999_999 / 250 = 3_999_999_999.996 → ceil → 4_000_000_000 * 250 = 1_000_000_000_000
    expect(roundMoney(999_999_999_999, IQD)).toBe(1_000_000_000_000);
  });

  it('handles 0 correctly across all modes', () => {
    expect(roundMoney(0, IQD)).toBe(0);
    expect(roundMoney(0, IQD_NEAREST)).toBe(0);
    expect(roundMoney(0, IQD_FLOOR)).toBe(0);
  });
});
