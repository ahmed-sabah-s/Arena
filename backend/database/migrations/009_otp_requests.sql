-- Migration 009: OTP requests table.
-- Stores hashed one-time-password codes sent over SMS for phone-based auth flows.
-- Plain codes are never persisted; we hash with SHA-256 before insert.

CREATE TABLE IF NOT EXISTS "otpRequests" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone VARCHAR(50) NOT NULL,
  "codeHash" VARCHAR(255) NOT NULL,
  purpose VARCHAR(20) NOT NULL
    CHECK (purpose IN ('registration', 'login', 'phone_change', 'password_reset')),
  attempts INT NOT NULL DEFAULT 0,
  "maxAttempts" INT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP NOT NULL,
  "consumedAt" TIMESTAMP,
  "ipAddress" VARCHAR(45),
  "userAgent" TEXT
);

-- Active OTP for a phone (most recent unconsumed) — used by verify
CREATE INDEX IF NOT EXISTS idx_otp_phone_active
  ON "otpRequests"(phone, "expiresAt") WHERE "consumedAt" IS NULL;

-- Recent send rate-limit lookups by phone
CREATE INDEX IF NOT EXISTS idx_otp_phone_recent
  ON "otpRequests"(phone, "createdAt" DESC);

-- Periodic cleanup job will scan by expiresAt
CREATE INDEX IF NOT EXISTS idx_otp_expires
  ON "otpRequests"("expiresAt") WHERE "consumedAt" IS NULL;
