import { randomUUID } from 'crypto';
import type { SmsProvider, SmsSendResult } from './SmsProvider.js';

/**
 * TestPair: a single configured phone+code pair always succeeds; everything else fails.
 * The OTP service short-circuits the *code* in test_pair mode (it forces OTP_TEST_CODE
 * for OTP_TEST_PHONE). This provider only enforces the phone gate.
 */
export class TestPairSmsProvider implements SmsProvider {
  readonly name = 'test-pair';
  private readonly testPhone: string;

  constructor() {
    const testPhone = process.env.OTP_TEST_PHONE;
    if (!testPhone) {
      throw new Error('TestPairSmsProvider: OTP_TEST_PHONE must be set in env');
    }
    this.testPhone = testPhone;
  }

  async send(phone: string, message: string): Promise<SmsSendResult> {
    if (phone !== this.testPhone) {
      return {
        success: false,
        errorCode: 'TEST_PHONE_MISMATCH',
        errorMessage: 'TestPair provider only delivers to the configured test phone',
      };
    }
    console.log(`[SMS:test-pair] phone=${phone} | message=${message}`);
    return {
      success: true,
      providerMessageId: `test-pair-${randomUUID()}`,
    };
  }
}
