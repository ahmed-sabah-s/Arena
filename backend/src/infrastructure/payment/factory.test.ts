import { describe, it, expect, afterEach } from 'vitest';
import { getPaymentProvider, resetPaymentProviderCacheForTesting } from './factory.js';

afterEach(() => {
  resetPaymentProviderCacheForTesting();
  delete process.env.PAYMENT_MODE;
});

describe('getPaymentProvider', () => {
  it('defaults to manual when PAYMENT_MODE is unset', () => {
    delete process.env.PAYMENT_MODE;
    expect(getPaymentProvider().name).toBe('manual');
  });

  it('returns ManualPaymentProvider when PAYMENT_MODE=manual', () => {
    process.env.PAYMENT_MODE = 'manual';
    expect(getPaymentProvider().name).toBe('manual');
  });

  it('returns LivePaymentProvider when PAYMENT_MODE=live', () => {
    process.env.PAYMENT_MODE = 'live';
    expect(getPaymentProvider().name).toBe('live');
  });

  it('throws on unknown PAYMENT_MODE', () => {
    process.env.PAYMENT_MODE = 'sneaky';
    expect(() => getPaymentProvider()).toThrow(/Unknown PAYMENT_MODE/);
  });

  it('caches the provider so the same instance is returned on subsequent calls', () => {
    process.env.PAYMENT_MODE = 'manual';
    const a = getPaymentProvider();
    const b = getPaymentProvider();
    expect(a).toBe(b);
  });
});
