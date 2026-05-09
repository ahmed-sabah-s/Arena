import type { PaymentProvider, PaymentResult, PaymentRequest } from './PaymentProvider.js';

const NOT_CONFIGURED =
  'LivePaymentProvider is a stub. Configure a real payment integration ' +
  '(QiCard, Tabadul, Areeba) in a later ops phase.';

/**
 * Stub — selected when PAYMENT_MODE=live but no real provider is wired yet.
 * Throws on every method so a misconfigured prod env fails fast and loud
 * instead of silently swallowing payments.
 */
export class LivePaymentProvider implements PaymentProvider {
  readonly name = 'live';

  async initiate(_req: PaymentRequest): Promise<PaymentResult> {
    throw new Error(NOT_CONFIGURED);
  }

  async checkStatus(_providerReference: string): Promise<PaymentResult> {
    throw new Error(NOT_CONFIGURED);
  }

  async markPaid(_providerReference: string, _byUserId: string): Promise<PaymentResult> {
    throw new Error(NOT_CONFIGURED);
  }
}
