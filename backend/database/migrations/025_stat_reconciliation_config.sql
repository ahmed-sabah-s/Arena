-- Migration 025: stat reconciliation tolerance config key.
-- Moves the previously-hardcoded ±2-minute tolerance window into platformConfig
-- so admins can tune it (clock drift between two phones recording the same goal
-- varies by venue / device).

INSERT INTO "platformConfig" (key, value, "valueType", category, description)
VALUES (
  'stat_reconciliation_tolerance_minutes',
  '2'::jsonb,
  'integer',
  'matches',
  'Tolerance window in minutes when matching stat events from two stat keepers during player_stats mode reconciliation.'
) ON CONFLICT (key) DO NOTHING;
