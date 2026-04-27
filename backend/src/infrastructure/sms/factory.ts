import type { SmsProvider } from './SmsProvider.js';
import { ConsoleSmsProvider } from './ConsoleSmsProvider.js';
import { TestPairSmsProvider } from './TestPairSmsProvider.js';
import { LiveSmsProvider } from './LiveSmsProvider.js';

let cachedProvider: SmsProvider | null = null;

/**
 * Returns the SmsProvider configured by the OTP_MODE env var.
 *  console   (default) — log to stdout, always succeeds
 *  test_pair          — only the OTP_TEST_PHONE gets messages
 *  live               — stub that throws (real provider wiring is Phase 7+)
 *
 * The provider is cached after first call so the same instance is reused.
 */
export function getSmsProvider(): SmsProvider {
  if (cachedProvider) return cachedProvider;

  const mode = process.env.OTP_MODE ?? 'console';

  switch (mode) {
    case 'console':
      cachedProvider = new ConsoleSmsProvider();
      break;
    case 'test_pair':
      cachedProvider = new TestPairSmsProvider();
      break;
    case 'live':
      cachedProvider = new LiveSmsProvider();
      break;
    default:
      throw new Error(`Unknown OTP_MODE: ${mode}`);
  }

  return cachedProvider;
}

/** Test helper: reset the cached provider so a different OTP_MODE can be used. */
export function resetSmsProviderCacheForTesting(): void {
  cachedProvider = null;
}
