import { randomUUID } from 'crypto';
import type { SmsProvider, SmsSendResult } from './SmsProvider.js';

export class ConsoleSmsProvider implements SmsProvider {
  readonly name = 'console';

  async send(phone: string, message: string): Promise<SmsSendResult> {
    console.log(`[SMS:console] phone=${phone} | message=${message}`);
    return {
      success: true,
      providerMessageId: `console-${randomUUID()}`,
    };
  }
}
