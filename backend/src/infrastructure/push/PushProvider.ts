/**
 * PushProvider — same shape as SmsProvider (Phase 2) and PaymentProvider
 * (Phase 7): an interface the rest of the code depends on, swappable
 * implementations behind a factory keyed off the `PUSH_MODE` env var.
 *
 * Phase 8 ships only `console` (logs to terminal; default for dev) and a
 * `live` stub that throws. Real provider integration (FCM, APNs, OneSignal,
 * etc.) is later ops work.
 *
 * The notification delivery worker uses `getPushProvider()` to dispatch
 * pending rows from the notifications outbox. If `PUSH_MODE=live` and the
 * live provider isn't wired, deliveries fail loudly and rows transition to
 * `failed` status — no silent swallowing.
 */

export type PushMode = 'console' | 'live';

export interface PushDeliveryRequest {
  userId: string;
  type: string;
  payload: Record<string, unknown>;
  preferredChannels?: ('push' | 'sms' | 'email')[];
}

export interface PushDeliveryResult {
  success: boolean;
  channel?: string;
  providerReference?: string;
  errorMessage?: string;
}

export interface PushProvider {
  readonly name: string;
  deliver(req: PushDeliveryRequest): Promise<PushDeliveryResult>;
}
