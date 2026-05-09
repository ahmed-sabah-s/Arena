import type { Currency } from '@arena/shared';
import { roundMoney } from '../../shared/money/index.js';

export interface CommissionCalculationInput {
  priceAmount: number;
  commissionPercent: number; // e.g., 8.0 for 8%
  currency: Currency;        // includes displayRoundingStep + displayRoundingMode
}

export interface CommissionCalculationResult {
  rawCommission: number;     // pre-rounding, kept for audit / debugging
  roundedCommission: number; // what gets stored / charged
  ownerPayout: number;       // priceAmount - roundedCommission
}

/**
 * Compute booking commission and owner payout.
 *
 * Floating-point during the percent multiplication is fine — we round the
 * result via the currency's displayRoundingStep + displayRoundingMode. The
 * stored commission must equal what's returned here so the venue owner
 * agrees with the platform on the cut to the qirsh.
 *
 * IQD example: priceAmount = 30000, commissionPercent = 8.0
 *   raw = 2400; for IQD (step 250, ceil) → roundedCommission = 2500;
 *   ownerPayout = 27500.
 *
 * Edge cases handled:
 *   - priceAmount = 0 → all results 0.
 *   - commissionPercent = 0 → roundedCommission = 0; ownerPayout = priceAmount.
 *   - rounding may push commission above price for very small amounts;
 *     ownerPayout is allowed to go negative in that pathological case so
 *     callers can surface it as an admin alert. Not expected in practice
 *     since the seeded IQD pricing in Phase 7 starts at 2000 IQD.
 */
export function calculateCommission(
  input: CommissionCalculationInput,
): CommissionCalculationResult {
  if (input.priceAmount === 0) {
    return { rawCommission: 0, roundedCommission: 0, ownerPayout: 0 };
  }
  const rawCommission = (input.priceAmount * input.commissionPercent) / 100;
  const roundedCommission = roundMoney(rawCommission, input.currency);
  const ownerPayout = input.priceAmount - roundedCommission;
  return { rawCommission, roundedCommission, ownerPayout };
}
