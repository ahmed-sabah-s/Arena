import type { PushProvider } from './PushProvider.js';
import { ConsolePushProvider } from './ConsolePushProvider.js';
import { LivePushProvider } from './LivePushProvider.js';

let cachedProvider: PushProvider | null = null;

/**
 * Returns the PushProvider configured by the PUSH_MODE env var.
 *  console (default) — logs to stdout, always succeeds.
 *  live              — stub that throws; real integration is later ops work.
 *
 * Cached after first call so the same instance is reused.
 */
export function getPushProvider(): PushProvider {
  if (cachedProvider) return cachedProvider;

  const mode = process.env.PUSH_MODE ?? 'console';

  switch (mode) {
    case 'console':
      cachedProvider = new ConsolePushProvider();
      break;
    case 'live':
      cachedProvider = new LivePushProvider();
      break;
    default:
      throw new Error(`Unknown PUSH_MODE: ${mode}`);
  }
  return cachedProvider;
}

export function resetPushProviderCacheForTesting(): void {
  cachedProvider = null;
}
