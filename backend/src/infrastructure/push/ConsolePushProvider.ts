import { randomUUID } from 'crypto';
import type {
  PushDeliveryRequest,
  PushDeliveryResult,
  PushProvider,
} from './PushProvider.js';

/**
 * Logs to stdout and returns success. Default in dev. Notification delivery
 * worker treats this as a successful delivery and the row transitions to
 * `sent` status.
 */
export class ConsolePushProvider implements PushProvider {
  readonly name = 'console';

  async deliver(req: PushDeliveryRequest): Promise<PushDeliveryResult> {
    console.log(
      `[PUSH:console] user=${req.userId} type=${req.type} ` +
      `payload=${JSON.stringify(req.payload)}`,
    );
    return {
      success: true,
      channel: 'push',
      providerReference: `console-${randomUUID()}`,
    };
  }
}
