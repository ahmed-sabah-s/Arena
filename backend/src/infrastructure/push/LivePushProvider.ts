import type {
  PushDeliveryRequest,
  PushDeliveryResult,
  PushProvider,
} from './PushProvider.js';

const NOT_CONFIGURED =
  'LivePushProvider is a stub. Configure a real push integration ' +
  '(FCM, APNs, OneSignal) in a later ops phase.';

/**
 * Selected when `PUSH_MODE=live` but no real provider is wired yet. Throws
 * on every delivery so a misconfigured prod env fails fast and loud — the
 * notification delivery worker catches the throw and transitions the row to
 * `failed` after exhausting retries.
 */
export class LivePushProvider implements PushProvider {
  readonly name = 'live';

  async deliver(_req: PushDeliveryRequest): Promise<PushDeliveryResult> {
    throw new Error(NOT_CONFIGURED);
  }
}
