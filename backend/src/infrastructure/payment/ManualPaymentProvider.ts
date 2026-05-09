import { randomUUID } from 'crypto';
import type {
  PaymentProvider,
  PaymentRequest,
  PaymentResult,
} from './PaymentProvider.js';

/**
 * Manual payment flow: the booking gets a generated reference, the booking
 * row's paymentStatus stays 'pending' until an admin records out-of-band
 * payment via markPaid. No external network calls happen in this provider.
 *
 * The provider itself is stateless. All persistent state lives on the
 * booking row (`paymentStatus`, `paymentProviderReference`); checkStatus
 * doesn't track in-memory state and returns 'pending' unconditionally —
 * callers should check the booking row for the current persisted status.
 */
export class ManualPaymentProvider implements PaymentProvider {
  readonly name = 'manual';

  async initiate(req: PaymentRequest): Promise<PaymentResult> {
    return {
      success: true,
      providerReference: `manual-${randomUUID()}`,
      status: 'pending',
    };
  }

  async checkStatus(_providerReference: string): Promise<PaymentResult> {
    return {
      success: true,
      providerReference: _providerReference,
      status: 'pending',
    };
  }

  async markPaid(providerReference: string, _byUserId: string): Promise<PaymentResult> {
    return {
      success: true,
      providerReference,
      status: 'paid',
    };
  }
}
