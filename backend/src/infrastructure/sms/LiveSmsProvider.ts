import type { SmsProvider, SmsSendResult } from './SmsProvider.js';

/**
 * Stub for the production SMS provider (Areeba / Qi / Tabadul / Twilio).
 * Always throws — fails loud so production cannot deploy without a real implementation.
 */
export class LiveSmsProvider implements SmsProvider {
  readonly name = 'live';

  async send(_phone: string, _message: string): Promise<SmsSendResult> {
    throw new Error(
      'LiveSmsProvider is a stub. Configure a real SMS provider (Areeba/Qi/Tabadul/Twilio) before deploying to production.',
    );
  }
}
