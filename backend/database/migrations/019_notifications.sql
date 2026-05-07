-- Migration 019: Notifications outbox.
-- Phase 5 inserts rows; Phase 8 wires real push delivery. Each row represents a
-- queued in-app/push notification for a specific user.

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "userId" UUID NOT NULL REFERENCES "user"(id),
  type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL,
  "deliveryStatus" VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK ("deliveryStatus" IN ('pending', 'sent', 'failed', 'cancelled')),
  "scheduledFor" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP,
  "readAt" TIMESTAMP,
  "errorMessage" TEXT,
  "retryCount" INT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- In-app inbox: list a user's unread, newest first.
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications("userId", "createdAt" DESC)
  WHERE "readAt" IS NULL;

-- Phase 8 delivery worker pulls pending items in scheduledFor order.
CREATE INDEX IF NOT EXISTS idx_notifications_pending_delivery
  ON notifications("scheduledFor")
  WHERE "deliveryStatus" = 'pending';

-- Recent-history queries by user.
CREATE INDEX IF NOT EXISTS idx_notifications_user_recent
  ON notifications("userId", "createdAt" DESC);
