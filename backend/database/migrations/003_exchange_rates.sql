-- Migration 003: Exchange rates table.
-- Used only for cross-currency reporting and display.
-- Transaction prices are never converted at write time — they stay in their native currency.
-- Table starts empty; populated later when multi-market reporting is needed.

CREATE TABLE IF NOT EXISTS "exchangeRates" (
  "fromCurrency" VARCHAR(3) NOT NULL REFERENCES currencies(code),
  "toCurrency" VARCHAR(3) NOT NULL REFERENCES currencies(code),
  rate DECIMAL(20, 10) NOT NULL,
  "asOfDate" DATE NOT NULL,
  source VARCHAR(50),
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("fromCurrency", "toCurrency", "asOfDate")
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_date ON "exchangeRates"("asOfDate" DESC);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_from ON "exchangeRates"("fromCurrency", "asOfDate" DESC);
