import "dotenv/config";

// ============================================================================
// OPTIONAL SERVICES CONFIGURATION
// Enable/disable services based on environment variables
// ============================================================================

export const optionalServices = {
  // AWS S3 for file storage
  s3: {
    enabled: Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_S3_BUCKET),
    config: {
      region: process.env.AWS_REGION || "us-east-1",
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      bucket: process.env.AWS_S3_BUCKET,
    },
  },

  // SMTP for email
  smtp: {
    enabled: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD),
    config: {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true",
      user: process.env.SMTP_USER,
      password: process.env.SMTP_PASSWORD,
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    },
  },

  // OTP/SMS service (Twilio, AWS SNS, etc.)
  otp: {
    enabled: Boolean(process.env.OTP_SERVICE_URL && process.env.OTP_SERVICE_AUTH_TOKEN),
    config: {
      url: process.env.OTP_SERVICE_URL,
      accountSid: process.env.OTP_SERVICE_ACCOUNT_SID,
      authToken: process.env.OTP_SERVICE_AUTH_TOKEN,
      phone: process.env.OTP_SERVICE_PHONE,
    },
  },

  // Two-Factor Authentication (TOTP)
  twoFactor: {
    enabled: process.env.ENABLE_2FA !== "false", // Enabled by default (no external service needed)
    config: {
      appName: process.env.APP_NAME || "Clean Architecture App",
      issuer: process.env.TWO_FACTOR_ISSUER || "YourCompany",
    },
  },
};

// Helper to check if service is available
export function isServiceEnabled(service: keyof typeof optionalServices): boolean {
  return optionalServices[service].enabled;
}

// Log enabled services on startup
export function logEnabledServices() {
  console.log("\n📦 Optional Services Status:");
  console.log(`  AWS S3:     ${optionalServices.s3.enabled ? "✅ Enabled" : "⚠️  Disabled"}`);
  console.log(`  SMTP:       ${optionalServices.smtp.enabled ? "✅ Enabled" : "⚠️  Disabled"}`);
  console.log(`  OTP/SMS:    ${optionalServices.otp.enabled ? "✅ Enabled" : "⚠️  Disabled"}`);
  console.log(`  2FA (TOTP): ${optionalServices.twoFactor.enabled ? "✅ Enabled" : "⚠️  Disabled"}`);
  console.log("");
}
