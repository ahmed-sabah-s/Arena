import { describe, it, expect } from 'vitest';
import { ManualPaymentProvider } from './ManualPaymentProvider.js';
import { LivePaymentProvider } from './LivePaymentProvider.js';

describe('ManualPaymentProvider', () => {
  const provider = new ManualPaymentProvider();

  it('initiate returns pending with a generated manual-* reference', async () => {
    const result = await provider.initiate({
      bookingId: 'b-1', amount: 30000, currency: 'IQD',
      payerUserId: 'u-pay', recipientUserId: 'u-recv',
      description: 'Stadium Asad — football, 1hr',
    });
    expect(result.success).toBe(true);
    expect(result.status).toBe('pending');
    expect(result.providerReference).toMatch(/^manual-/);
  });

  it('checkStatus returns pending for any reference (state lives on the booking row)', async () => {
    const result = await provider.checkStatus('manual-abc');
    expect(result.status).toBe('pending');
    expect(result.providerReference).toBe('manual-abc');
  });

  it('markPaid returns paid for the given reference', async () => {
    const result = await provider.markPaid('manual-xyz', 'u-admin');
    expect(result.success).toBe(true);
    expect(result.status).toBe('paid');
    expect(result.providerReference).toBe('manual-xyz');
  });
});

describe('LivePaymentProvider', () => {
  const provider = new LivePaymentProvider();

  it('throws on initiate', async () => {
    await expect(provider.initiate({
      bookingId: 'b-1', amount: 1, currency: 'IQD',
      payerUserId: 'u', recipientUserId: 'u', description: '',
    })).rejects.toThrow(/stub/);
  });

  it('throws on checkStatus', async () => {
    await expect(provider.checkStatus('ref')).rejects.toThrow(/stub/);
  });

  it('throws on markPaid', async () => {
    await expect(provider.markPaid?.('ref', 'u')).rejects.toThrow(/stub/);
  });
});
