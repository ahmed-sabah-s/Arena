import nodemailer, { Transporter } from 'nodemailer';
import { config } from '../../config';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export class EmailService {
  private transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      auth: config.SMTP_USER && config.SMTP_PASSWORD
        ? {
            user: config.SMTP_USER,
            pass: config.SMTP_PASSWORD,
          }
        : undefined,
    });
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    await this.transporter.sendMail({
      from: config.EMAIL_FROM,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
  }

  async sendWelcomeEmail(email: string, name: string): Promise<void> {
    const safeName = escapeHtml(name);
    await this.sendEmail({
      to: email,
      subject: 'Welcome to Our Platform',
      html: `
        <h1>Welcome, ${safeName}!</h1>
        <p>Thank you for registering on our platform.</p>
        <p>We're excited to have you on board!</p>
      `,
    });
  }

  async sendPasswordResetEmail(email: string, resetToken: string): Promise<void> {
    const safeToken = encodeURIComponent(resetToken);
    const resetUrl = `${config.FRONTEND_URL}/reset-password/${safeToken}`;
    const safeUrl = escapeHtml(resetUrl);
    await this.sendEmail({
      to: email,
      subject: 'Password Reset Request',
      html: `
        <h1>Password Reset</h1>
        <p>You requested a password reset. Click the link below to reset your password:</p>
        <a href="${safeUrl}">${safeUrl}</a>
        <p>This link will expire in 15 minutes.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `,
    });
  }

  async sendOTPEmail(email: string, otp: string): Promise<void> {
    const safeOtp = escapeHtml(otp);
    await this.sendEmail({
      to: email,
      subject: 'Your OTP Code',
      html: `
        <h1>Your OTP Code</h1>
        <p>Your one-time password is: <strong>${safeOtp}</strong></p>
        <p>This code will expire in 10 minutes.</p>
      `,
    });
  }
}
