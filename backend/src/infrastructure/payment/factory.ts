import type { PaymentProvider } from './PaymentProvider.js';
import { ManualPaymentProvider } from './ManualPaymentProvider.js';
import { LivePaymentProvider } from './LivePaymentProvider.js';

let cachedProvider: PaymentProvider | null = null;

/**
 * Returns the PaymentProvider configured by the PAYMENT_MODE env var.
 *  manual (default) — stateless; admin records out-of-band payments and
 *                     marks bookings paid via the admin endpoint.
 *  live             — stub that throws; real integration is later ops work.
 *
 * Cached after first call so the same instance is reused.
 */
export function getPaymentProvider(): PaymentProvider {
  if (cachedProvider) return cachedProvider;

  const mode = process.env.PAYMENT_MODE ?? 'manual';

  switch (mode) {
    case 'manual':
      cachedProvider = new ManualPaymentProvider();
      break;
    case 'live':
      cachedProvider = new LivePaymentProvider();
      break;
    default:
      throw new Error(`Unknown PAYMENT_MODE: ${mode}`);
  }

  return cachedProvider;
}

/** Test helper: reset the cached provider so a different PAYMENT_MODE can be used. */
export function resetPaymentProviderCacheForTesting(): void {
  cachedProvider = null;
}
