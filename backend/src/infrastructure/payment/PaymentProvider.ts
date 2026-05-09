/**
 * PaymentProvider — same shape as SmsProvider: an interface the rest of the
 * code depends on, swappable implementations behind a factory keyed off the
 * `PAYMENT_MODE` env var.
 *
 * Phase 7 only ships the `manual` implementation — admin records that money
 * changed hands out-of-band (cash, bank transfer, etc.) and marks the
 * booking paid via an admin endpoint. The `live` implementation is a stub
 * that throws; real provider integration (QiCard, Tabadul, Areeba) is later
 * ops work.
 *
 * Provider results carry a `providerReference` string that the booking row
 * stores in `paymentProviderReference`. For the manual provider this is a
 * generated `manual-<uuid>`; for live providers it'll be whatever the
 * integration returns (transaction ID, intent ID, etc.).
 */

export type PaymentMode = 'manual' | 'live';

export type PaymentStatus = 'pending' | 'paid' | 'failed';

export interface PaymentRequest {
  bookingId: string;
  amount: number;
  currency: string;
  payerUserId: string;
  recipientUserId: string;
  description: string;
}

export interface PaymentResult {
  success: boolean;
  providerReference?: string;
  status: PaymentStatus;
  errorCode?: string;
  errorMessage?: string;
}

export interface PaymentProvider {
  readonly name: string;
  initiate(req: PaymentRequest): Promise<PaymentResult>;
  /** Provider-specific webhook / poll for status. Returns current status. */
  checkStatus(providerReference: string): Promise<PaymentResult>;
  /** Admin-triggered manual mark-as-paid. Used by ManualPaymentProvider. */
  markPaid?(providerReference: string, byUserId: string): Promise<PaymentResult>;
}
