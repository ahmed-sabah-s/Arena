-- Migration 004: Platform configuration table.
-- Central store for all fees, thresholds, feature flags, and configurable behaviors.
-- Every business rule that could change without a code deploy lives here.

CREATE TABLE IF NOT EXISTS "platformConfig" (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  "valueType" VARCHAR(20) NOT NULL
    CHECK ("valueType" IN ('string', 'number', 'integer', 'boolean', 'array', 'object')),
  description TEXT,
  category VARCHAR(50) NOT NULL,
  "updatedBy" UUID REFERENCES "user"(id),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS update_platform_config_updated_at ON "platformConfig";
CREATE TRIGGER update_platform_config_updated_at BEFORE UPDATE ON "platformConfig"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_platform_config_category ON "platformConfig"(category);

-- ─── feature_flags ────────────────────────────────────────────────────────────
INSERT INTO "platformConfig" (key, value, "valueType", category, description) VALUES
  ('season_pass_enabled',            'false', 'boolean', 'feature_flags', 'Whether team season passes are sold.'),
  ('referee_payments_enabled',       'false', 'boolean', 'feature_flags', 'Whether referees can receive match payments.'),
  ('venue_subscriptions_enabled',    'false', 'boolean', 'feature_flags', 'Whether venues pay recurring subscription fees.'),
  ('tournaments_enabled',            'false', 'boolean', 'feature_flags', 'Tournaments come post-launch; disabled until ready.'),
  ('public_leaderboard_enabled',     'true',  'boolean', 'feature_flags', 'Allow unauthenticated users to browse the leaderboard.'),
  ('public_profiles_enabled',        'true',  'boolean', 'feature_flags', 'Allow unauthenticated users to view team and player profiles.'),
  ('public_venues_enabled',          'true',  'boolean', 'feature_flags', 'Allow unauthenticated users to browse venue listings.'),
  ('multi_currency_display_enabled', 'false', 'boolean', 'feature_flags', 'Show approximate cross-currency conversions in the UI.'),
  ('matchmaking_sparse_mode_enabled','true',  'boolean', 'feature_flags', 'Sparse-pool launch mode active; relaxes MMR gap limits when pool is thin.')
ON CONFLICT (key) DO NOTHING;

-- ─── monetization ─────────────────────────────────────────────────────────────
INSERT INTO "platformConfig" (key, value, "valueType", category, description) VALUES
  ('venue_commission_percent',       '8.0',   'number',  'monetization', 'Percent of venue booking revenue that goes to the platform.'),
  ('prize_pool_winners_percent',     '70',    'integer', 'monetization', 'Percent of tournament prize pool distributed to winners; remainder is platform cut.'),
  ('season_pass_price_iqd',          '5000',  'integer', 'monetization', 'Price of a team season pass in IQD. Migrated to amount+currency pair when season passes activate.'),
  ('venue_subscription_price_iqd',   '15000', 'integer', 'monetization', 'Monthly venue subscription fee in IQD.'),
  ('referee_match_fee_iqd',          '0',     'integer', 'monetization', 'Per-match payment for referees in IQD. Zero until referee_payments_enabled is true.')
ON CONFLICT (key) DO NOTHING;

-- ─── elo ──────────────────────────────────────────────────────────────────────
INSERT INTO "platformConfig" (key, value, "valueType", category, description) VALUES
  ('starting_mmr_beginner',                    '800',  'integer', 'elo', 'Starting MMR assigned to players who self-report beginner skill.'),
  ('starting_mmr_intermediate',               '1000',  'integer', 'elo', 'Starting MMR for intermediate self-report.'),
  ('starting_mmr_advanced',                   '1200',  'integer', 'elo', 'Starting MMR for advanced self-report.'),
  ('starting_mmr_expert',                     '1400',  'integer', 'elo', 'Starting MMR for expert self-report.'),
  ('calibration_match_count',                   '10',  'integer', 'elo', 'Number of matches played before calibration phase completes.'),
  ('calibration_k_factor_initial',             '2.0',  'number',  'elo', 'K-factor multiplier for the first portion of calibration matches.'),
  ('calibration_k_factor_late',                '1.4',  'number',  'elo', 'K-factor multiplier for the late portion of calibration matches.'),
  ('calibration_k_factor_initial_match_threshold', '5','integer', 'elo', 'After this many calibration matches, K drops from initial to late multiplier.'),
  ('k_factor_default',                         '1.0',  'number',  'elo', 'Standard K-factor multiplier post-calibration for all ranked matches.'),
  ('elo_gap_no_gain_threshold',                '300',  'integer', 'elo', 'MMR gap above which the heavy favourite gains zero visible ELO on a win.'),
  ('elo_gap_no_loss_threshold',                '300',  'integer', 'elo', 'MMR gap above which the underdog loses zero visible ELO on a loss.'),
  ('elo_gap_reduced_threshold',                '150',  'integer', 'elo', 'MMR gap above which gains and losses are halved (soft zone before no-gain/no-loss).'),
  ('tier_threshold_bronze',                      '0',  'integer', 'elo', 'Minimum MMR for the Bronze tier.'),
  ('tier_threshold_silver',                   '1000',  'integer', 'elo', 'Minimum MMR for the Silver tier.'),
  ('tier_threshold_gold',                     '1300',  'integer', 'elo', 'Minimum MMR for the Gold tier.'),
  ('tier_threshold_platinum',                 '1600',  'integer', 'elo', 'Minimum MMR for the Platinum tier.'),
  ('tier_threshold_elite',                    '1900',  'integer', 'elo', 'Minimum MMR for the Elite tier.'),
  ('veteran_match_threshold',                   '50',  'integer', 'elo', 'Match count at which a player is considered a veteran for analytics and smurf detection.')
ON CONFLICT (key) DO NOTHING;

-- ─── matchmaking ──────────────────────────────────────────────────────────────
INSERT INTO "platformConfig" (key, value, "valueType", category, description) VALUES
  ('matchmaking_min_pool_threshold',    '20',  'integer', 'matchmaking', 'If fewer active teams in a game+format pool than this, sparse matchmaking mode applies.'),
  ('matchmaking_sparse_max_wait_minutes','10', 'integer', 'matchmaking', 'Maximum wait time in sparse mode before showing the user a no-match-found message.'),
  ('matchmaking_sparse_gap_2min',      '100',  'integer', 'matchmaking', 'Maximum MMR gap allowed in sparse mode after 2 minutes of waiting.'),
  ('matchmaking_sparse_gap_5min',      '300',  'integer', 'matchmaking', 'Maximum MMR gap allowed in sparse mode after 5 minutes of waiting.'),
  ('matchmaking_sparse_gap_8min',      '600',  'integer', 'matchmaking', 'Maximum MMR gap allowed in sparse mode after 8 minutes of waiting.'),
  ('matchmaking_mature_gap_2min',      '100',  'integer', 'matchmaking', 'Maximum MMR gap in mature-pool matchmaking after 2 minutes.'),
  ('matchmaking_mature_gap_5min',      '200',  'integer', 'matchmaking', 'Maximum MMR gap in mature-pool matchmaking after 5 minutes.'),
  ('matchmaking_mature_gap_max',       '400',  'integer', 'matchmaking', 'Hard cap on MMR gap in mature-pool matchmaking regardless of wait time.')
ON CONFLICT (key) DO NOTHING;

-- ─── queue ────────────────────────────────────────────────────────────────────
INSERT INTO "platformConfig" (key, value, "valueType", category, description) VALUES
  ('queue_friendly_after_minutes', '10', 'integer', 'queue', 'After this many minutes in queue without a ranked match, offer the user a friendly-only match.')
ON CONFLICT (key) DO NOTHING;

-- ─── anti_abuse ───────────────────────────────────────────────────────────────
INSERT INTO "platformConfig" (key, value, "valueType", category, description) VALUES
  ('max_teams_per_user_per_game_per_window', '2',    'integer', 'anti_abuse', 'Maximum teams a single user can be active on for the same game in a rolling window.'),
  ('team_creation_cooldown_days',            '90',   'integer', 'anti_abuse', 'Days a user must wait before creating another team in the same game after creating one.'),
  ('captain_disband_cooldown_days',          '30',   'integer', 'anti_abuse', 'Days a captain must wait before creating a new team after disbanding one.'),
  ('rematch_full_elo_limit',                 '1',    'integer', 'anti_abuse', 'Maximum full-ELO rematches allowed against the same opponent in the rematch window.'),
  ('rematch_half_elo_limit',                 '2',    'integer', 'anti_abuse', 'Maximum half-ELO rematches allowed against the same opponent in the rematch window.'),
  ('rematch_window_days',                    '7',    'integer', 'anti_abuse', 'Rolling window in days for evaluating rematch limits.'),
  ('smurf_detection_winrate_threshold',      '0.85', 'number',  'anti_abuse', 'Win rate over the veteran match threshold that flags an account for smurf review.'),
  ('referee_same_team_limit',                '3',    'integer', 'anti_abuse', 'Maximum times a referee can officiate the same team within the conflict window.'),
  ('referee_conflict_window_days',           '30',   'integer', 'anti_abuse', 'Rolling window in days for evaluating referee conflict-of-interest limits.')
ON CONFLICT (key) DO NOTHING;

-- ─── referees ─────────────────────────────────────────────────────────────────
INSERT INTO "platformConfig" (key, value, "valueType", category, description) VALUES
  ('referee_checkin_minutes_before',    '30',  'integer', 'referees', 'Minutes before match start by which a referee must check in.'),
  ('referee_promote_minutes_before',    '15',  'integer', 'referees', 'Minutes before match start at which the system promotes a backup referee if primary hasn''t checked in.'),
  ('referee_reclaim_grace_minutes',      '5',  'integer', 'referees', 'Grace period after promotion during which the original referee can reclaim the assignment.'),
  ('referee_first_offense_penalty',     '0.2', 'number',  'referees', 'Reputation score deduction for a referee''s first no-show or late check-in offense.'),
  ('referee_repeat_offense_penalty',    '0.5', 'number',  'referees', 'Reputation score deduction for repeat referee offenses within the offense window.'),
  ('referee_offense_window_days',       '90',  'integer', 'referees', 'Rolling window in days for evaluating referee penalty accumulation.')
ON CONFLICT (key) DO NOTHING;

-- ─── matches ──────────────────────────────────────────────────────────────────
INSERT INTO "platformConfig" (key, value, "valueType", category, description) VALUES
  ('forfeit_window_minutes',            '15', 'integer', 'matches', 'Minutes after scheduled start that the present team can formally declare a forfeit.'),
  ('both_confirm_forfeit_window_hours', '24', 'integer', 'matches', 'Hours before a single-side submission auto-resolves as the result if the other side doesn''t respond.')
ON CONFLICT (key) DO NOTHING;

-- ─── qr ───────────────────────────────────────────────────────────────────────
INSERT INTO "platformConfig" (key, value, "valueType", category, description) VALUES
  ('match_invite_expiry_minutes', '15', 'integer', 'qr', 'Minutes until a QR-code match invite link expires.')
ON CONFLICT (key) DO NOTHING;

-- ─── auth ─────────────────────────────────────────────────────────────────────
INSERT INTO "platformConfig" (key, value, "valueType", category, description) VALUES
  ('otp_max_sends_per_hour',    '3', 'integer', 'auth', 'Maximum OTP SMS messages the system will send to a single phone number per hour.'),
  ('otp_expiry_minutes',        '5', 'integer', 'auth', 'Minutes until an OTP code expires after being sent.'),
  ('otp_max_verify_attempts',   '5', 'integer', 'auth', 'Maximum failed OTP verification attempts before the code is invalidated.'),
  ('otp_code_length',           '6', 'integer', 'auth', 'Number of digits in a generated OTP code.')
ON CONFLICT (key) DO NOTHING;

-- ─── platform ─────────────────────────────────────────────────────────────────
INSERT INTO "platformConfig" (key, value, "valueType", category, description) VALUES
  ('default_currency',         '"IQD"',       'string',  'platform', 'Default currency used when no user preference is available.'),
  ('supported_currencies',     '["IQD"]',     'array',   'platform', 'Active currencies for fast lookup; mirrors isActive=true rows in the currencies table.'),
  ('environment_name',         '"dev"',       'string',  'platform', 'Current deployment environment. Read-only at runtime; set per environment via seed.'),
  ('app_min_version_ios',      '"1.0.0"',     'string',  'platform', 'Minimum iOS app version allowed; clients below this version are force-updated.'),
  ('app_min_version_android',  '"1.0.0"',     'string',  'platform', 'Minimum Android app version allowed; clients below this version are force-updated.')
ON CONFLICT (key) DO NOTHING;
