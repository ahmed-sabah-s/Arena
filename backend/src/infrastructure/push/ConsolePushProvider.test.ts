import { describe, it, expect, vi } from 'vitest';
import { ConsolePushProvider } from './ConsolePushProvider.js';
import { LivePushProvider } from './LivePushProvider.js';

describe('ConsolePushProvider', () => {
  it('logs and returns success with a console-* reference', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const provider = new ConsolePushProvider();
    const result = await provider.deliver({
      userId: 'u-1', type: 'match_locked', payload: { matchId: 'm-1' },
    });
    expect(result.success).toBe(true);
    expect(result.channel).toBe('push');
    expect(result.providerReference).toMatch(/^console-/);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('user=u-1'));
    logSpy.mockRestore();
  });
});

describe('LivePushProvider', () => {
  it('throws on every deliver call', async () => {
    const provider = new LivePushProvider();
    await expect(provider.deliver({
      userId: 'u-1', type: 'match_locked', payload: {},
    })).rejects.toThrow(/stub/);
  });
});
