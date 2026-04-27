export interface SmsSendResult {
  success: boolean;
  providerMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface SmsProvider {
  send(phone: string, message: string): Promise<SmsSendResult>;
  /** Provider identifier, e.g. 'console', 'test-pair', 'live'. */
  readonly name: string;
}
