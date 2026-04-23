# Database Migrations – Claude Code Guide

## Migration Files

Migrations live in `backend/database/migrations/`. File naming:
- Format: `NNN_snake_case_description.sql`
- `NNN` is a three-digit zero-padded incrementing number (000, 001, 002, …).
- One logical change per file.
- Never edit an applied migration—create a new one to alter.

Example: `001_add_user_table.sql`, `002_add_team_table.sql`, `003_add_user_team_junction.sql`

## Migration Runner

`pnpm --filter ./backend db:migrate` applies all pending migrations.

- Tracks applied migrations in the `schemaMigrations` table.
- Runs each pending migration in a transaction.
- Logs duration and success/failure for each.
- On error, the transaction rolls back and the process exits non-zero.

`pnpm --filter ./backend db:migrate:dry` lists pending migrations without applying.

## Idempotency

Write migrations to be idempotent where possible:
```sql
CREATE TABLE IF NOT EXISTS "user" (…);
ALTER TABLE "post" ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP;
```

## Indexes

Every new table includes its indexes in the same migration—not a follow-up.

```sql
CREATE TABLE IF NOT EXISTS "post" (
  id UUID PRIMARY KEY,
  "userId" UUID NOT NULL,
  …
);

CREATE INDEX idx_post_user_id ON "post"("userId");
CREATE INDEX idx_post_created_at ON "post"("createdAt");
```

## Schema Conventions

- **Identifiers:** camelCase, always quoted (e.g. `"userId"`).
- **Primary keys:** UUID via `uuid_generate_v4()`.
- **Timestamps:** `createdAt` and `updatedAt` on all mutable tables (created via trigger for `updatedAt`).
- **Soft deletes:** `deletedAt` on users, teams, venues only; never on immutable tables.
- **Foreign keys:** always indexed explicitly.
- **Enums:** stored as VARCHAR with CHECK constraints (not PostgreSQL ENUM type).

Example:
```sql
CREATE TABLE IF NOT EXISTS "post" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "userId" UUID NOT NULL REFERENCES "user"(id),
  title VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP
);

CREATE INDEX idx_post_user_id ON "post"("userId");
CREATE INDEX idx_post_created_at ON "post"("createdAt");
```

## Currency Columns

Every money amount is a pair:
```sql
CREATE TABLE IF NOT EXISTS "transaction" (
  id UUID PRIMARY KEY,
  amount BIGINT NOT NULL,  -- in subunits (e.g., fils)
  currency VARCHAR(3) NOT NULL REFERENCES currency(code),
  …
);
```

Money is never stored without the currency code.

## Scripts

- `pnpm --filter ./backend db:migrate` – Apply pending migrations
- `pnpm --filter ./backend db:migrate:dry` – List pending without applying
- `pnpm --filter ./backend db:reset` – Drop DB, migrate, seed
- `pnpm --filter ./backend db:seed` – Run seed data
- `pnpm --filter ./backend db:setup` – Create DB, migrate, seed
