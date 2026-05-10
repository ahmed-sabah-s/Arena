import { describe, it, expect, afterEach } from 'vitest';
import { getPushProvider, resetPushProviderCacheForTesting } from './factory.js';

afterEach(() => {
  resetPushProviderCacheForTesting();
  delete process.env.PUSH_MODE;
});

describe('getPushProvider', () => {
  it('defaults to console when PUSH_MODE is unset', () => {
    delete process.env.PUSH_MODE;
    expect(getPushProvider().name).toBe('console');
  });

  it('returns ConsolePushProvider when PUSH_MODE=console', () => {
    process.env.PUSH_MODE = 'console';
    expect(getPushProvider().name).toBe('console');
  });

  it('returns LivePushProvider when PUSH_MODE=live', () => {
    process.env.PUSH_MODE = 'live';
    expect(getPushProvider().name).toBe('live');
  });

  it('throws on unknown PUSH_MODE', () => {
    process.env.PUSH_MODE = 'sneaky';
    expect(() => getPushProvider()).toThrow(/Unknown PUSH_MODE/);
  });

  it('caches the provider after first call', () => {
    process.env.PUSH_MODE = 'console';
    expect(getPushProvider()).toBe(getPushProvider());
  });
});
