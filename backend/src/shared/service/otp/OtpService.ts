import { randomInt } from 'crypto';
import axios from 'axios';
import { config } from '../../config';

export class OtpService {
  private baseUrl: string;
  private accountSid: string;
  private authToken: string;
  private fromPhone: string;

  constructor() {
    this.baseUrl = config.OTP_SERVICE_URL || '';
    this.accountSid = config.OTP_SERVICE_ACCOUNT_SID || '';
    this.authToken = config.OTP_SERVICE_AUTH_TOKEN || '';
    this.fromPhone = config.OTP_SERVICE_PHONE || '';
  }

  generateOTP(length: number = 6): string {
    return Array.from({ length }, () => randomInt(10)).join('');
  }

  async sendSMS(phone: string, message: string): Promise<void> {
    if (!this.baseUrl || !this.accountSid || !this.authToken || !this.fromPhone) {
      throw new Error('SMS service is not configured');
    }
    // Enforce E.164 format (+[country code][number], e.g. +14155552671)
    if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
      throw new Error('Phone number must be in E.164 format (e.g. +14155552671)');
    }
    // Example using Twilio
    try {
      await axios.post(
        `${this.baseUrl}/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
        new URLSearchParams({
          To: phone,
          From: this.fromPhone,
          Body: message,
        }),
        {
          auth: {
            username: this.accountSid,
            password: this.authToken,
          },
        }
      );
    } catch (error) {
      console.error('Failed to send SMS:', error);
      throw new Error('Failed to send OTP SMS');
    }
  }

  async sendOTP(phone: string, otp: string): Promise<void> {
    const message = `Your verification code is: ${otp}. Valid for 10 minutes.`;
    await this.sendSMS(phone, message);
  }
}
