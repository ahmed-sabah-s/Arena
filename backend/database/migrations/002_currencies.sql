-- Migration 002: Currencies table.
-- Source of truth for supported currencies, sub-unit factors, and display rounding rules.

CREATE TABLE IF NOT EXISTS currencies (
  code VARCHAR(3) PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  "nameAr" VARCHAR(50) NOT NULL,
  symbol VARCHAR(10),
  "subunitFactor" INT NOT NULL,
  "displayRoundingStep" INT NOT NULL,
  "displayRoundingMode" VARCHAR(10) NOT NULL DEFAULT 'ceil'
    CHECK ("displayRoundingMode" IN ('ceil', 'nearest', 'floor')),
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS update_currencies_updated_at ON currencies;
CREATE TRIGGER update_currencies_updated_at BEFORE UPDATE ON currencies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_currencies_active ON currencies("isActive") WHERE "isActive" = true;

-- Catalog seed: all supported currencies.
-- isActive=true only for IQD at launch; others are defined and ready for future markets.
INSERT INTO currencies (code, name, "nameAr", symbol, "subunitFactor", "displayRoundingStep", "displayRoundingMode", "isActive") VALUES
  ('IQD', 'Iraqi Dinar',      'دينار عراقي',   'د.ع', 1,    250, 'ceil', true),
  ('USD', 'US Dollar',        'دولار أمريكي',  '$',   100,  1,   'ceil', false),
  ('JOD', 'Jordanian Dinar',  'دينار أردني',   'د.أ', 1000, 25,  'ceil', false),
  ('SAR', 'Saudi Riyal',      'ريال سعودي',    'ر.س', 100,  1,   'ceil', false),
  ('AED', 'UAE Dirham',       'درهم إماراتي',  'د.إ', 100,  1,   'ceil', false),
  ('TRY', 'Turkish Lira',     'ليرة تركية',    '₺',   100,  1,   'ceil', false)
ON CONFLICT (code) DO NOTHING;

-- Deferred FK from migration 001: user."preferredCurrency" → currencies(code).
-- Added here because currencies didn't exist when migration 001 ran.
-- DO block makes the ADD CONSTRAINT idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_preferred_currency_fk'
  ) THEN
    ALTER TABLE "user"
      ADD CONSTRAINT user_preferred_currency_fk
      FOREIGN KEY ("preferredCurrency") REFERENCES currencies(code);
  END IF;
END $$;
