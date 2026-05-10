-- Migration 036: Scheduler infrastructure (locks + run history) + Phase-8
-- platformConfig keys for cron expressions, notification batching, and OTP
-- retention.
--
-- Single-instance in-process scheduling is fine at launch volumes, but the
-- moment we deploy two API replicas every job fires twice. We build the lock
-- table now so the same code works when scaled — even with one instance
-- today, the lock acquisition pattern is identical.
--
-- schedulerJobLocks: one row per job. The first instance to acquire the lock
-- (insert / refresh) wins; others see no RETURNING row and skip the run.
-- expiresAt lets a stuck job's lock be reclaimed after a TTL.
--
-- schedulerJobRuns: append-only execution history for ops dashboards.

CREATE TABLE IF NOT EXISTS "schedulerJobLocks" (
  "jobName" VARCHAR(100) PRIMARY KEY,
  "lockedAt" TIMESTAMP NOT NULL,
  "lockedBy" VARCHAR(100) NOT NULL,
  "expiresAt" TIMESTAMP NOT NULL,
  "lastRunStartedAt" TIMESTAMP,
  "lastRunCompletedAt" TIMESTAMP,
  "lastRunStatus" VARCHAR(20)
    CHECK ("lastRunStatus" IS NULL OR "lastRunStatus" IN ('success', 'failure', 'timeout')),
  "lastRunDurationMs" INTEGER,
  "lastRunError" TEXT
);

-- (No partial index on expiresAt: CURRENT_TIMESTAMP isn't IMMUTABLE so it
-- can't be used in an index predicate. Lock acquisition keys off the
-- primary key (jobName) and the count of locks is bounded by the number of
-- registered jobs, so a full-table scan over expired ones is fine.)

CREATE TABLE IF NOT EXISTS "schedulerJobRuns" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "jobName" VARCHAR(100) NOT NULL,
  "startedAt" TIMESTAMP NOT NULL,
  "completedAt" TIMESTAMP,
  status VARCHAR(20) NOT NULL
    CHECK (status IN ('running', 'success', 'failure', 'timeout')),
  "durationMs" INTEGER,
  result JSONB,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_scheduler_runs_recent
  ON "schedulerJobRuns"("jobName", "startedAt" DESC);

-- ─── Cron schedules (Phase 8) ──────────────────────────────────────────────
-- 6-field form supports seconds for the high-frequency notification delivery
-- job. Other jobs use the standard 5-field form.

INSERT INTO "platformConfig" (key, value, "valueType", category, description) VALUES
  (
    'cron_match_forfeit_sweep',
    '"*/5 * * * *"'::jsonb, 'string', 'cron_expressions',
    'Cron schedule for the match forfeit sweep job. Default: every 5 minutes.'
  ),
  (
    'cron_match_invite_expiry',
    '"*/2 * * * *"'::jsonb, 'string', 'cron_expressions',
    'Cron schedule for expiring stale match invites. Default: every 2 minutes.'
  ),
  (
    'cron_referee_checkin_window',
    '"* * * * *"'::jsonb, 'string', 'cron_expressions',
    'Cron schedule for sending referee check-in notifications. Default: every minute.'
  ),
  (
    'cron_referee_auto_promotion',
    '"* * * * *"'::jsonb, 'string', 'cron_expressions',
    'Cron schedule for auto-promoting assistant referees. Default: every minute.'
  ),
  (
    'cron_notification_delivery',
    '"*/30 * * * * *"'::jsonb, 'string', 'cron_expressions',
    'Cron schedule for delivering pending notifications. Default: every 30 seconds (6-field form).'
  ),
  (
    'cron_booking_no_show_sweep',
    '"*/15 * * * *"'::jsonb, 'string', 'cron_expressions',
    'Cron schedule for marking unattended bookings as no_show. Default: every 15 minutes.'
  ),
  (
    'cron_otp_expiry_sweep',
    '"*/10 * * * *"'::jsonb, 'string', 'cron_expressions',
    'Cron schedule for marking expired OTP requests. Default: every 10 minutes.'
  ),
  (
    'cron_otp_retention_cleanup',
    '"0 3 * * *"'::jsonb, 'string', 'cron_expressions',
    'Cron schedule for OTP retention cleanup (delete rows older than otp_retention_days). Default: 03:00 daily.'
  )
ON CONFLICT (key) DO NOTHING;

-- ─── Notification delivery tunables ────────────────────────────────────────

INSERT INTO "platformConfig" (key, value, "valueType", category, description) VALUES
  (
    'notification_batch_size',
    '50'::jsonb, 'integer', 'platform',
    'Number of notifications processed per delivery sweep.'
  ),
  (
    'notification_max_retries',
    '3'::jsonb, 'integer', 'platform',
    'Number of times the delivery worker retries a failed notification before marking it failed.'
  ),
  (
    'notification_retry_backoff_seconds',
    '60'::jsonb, 'integer', 'platform',
    'Backoff between notification delivery retries.'
  )
ON CONFLICT (key) DO NOTHING;

-- ─── OTP retention (used by the daily cleanup job) ─────────────────────────

INSERT INTO "platformConfig" (key, value, "valueType", category, description)
VALUES (
  'otp_retention_days',
  '30'::jsonb, 'integer', 'auth',
  'Days to retain OTP request records before deletion.'
)
ON CONFLICT (key) DO NOTHING;
