import type { Currency } from '@arena/shared';

/**
 * Round a money amount according to the currency's display rounding rules.
 *
 * Amount must be in the currency's native unit (whole IQD for IQD, qirsh for JOD,
 * cents for USD). bigint input is accepted but converted to number for the math —
 * this is safe because realistic Arena money values fit comfortably within
 * Number.MAX_SAFE_INTEGER (2^53 - 1 ≈ 9 quadrillion IQD).
 */
export function roundMoney(amount: number | bigint, currency: Currency): number {
  const n = typeof amount === 'bigint' ? Number(amount) : amount;
  const { displayRoundingStep: step, displayRoundingMode: mode } = currency;

  if (step <= 0) {
    throw new Error(`Invalid displayRoundingStep ${step} for currency ${currency.code}`);
  }

  switch (mode) {
    case 'ceil':    return Math.ceil(n / step) * step;
    case 'nearest': return Math.round(n / step) * step;
    case 'floor':   return Math.floor(n / step) * step;
  }
}

/**
 * Alias of roundMoney for use at display / formatting sites.
 * Reads more clearly at call sites: roundMoneyForDisplay(price, currency).
 */
export const roundMoneyForDisplay = roundMoney;
