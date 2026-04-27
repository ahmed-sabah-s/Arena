# Catalog Seed Data

Catalog data (currencies, games, game formats, divisions, platform config) is seeded
**inline inside the migration files**, not here.

This is intentional: catalog data is structural and identical across all environments,
so it belongs with the schema rather than in environment-specific seed files.

If a catalog value needs to change (e.g., adding a new game), create a new migration.
Do not edit an applied migration.

## What goes in environment-specific seed files

Environment-specific seeds live in `database/seeds/`:

| File           | Purpose                                                        |
|----------------|----------------------------------------------------------------|
| `dev.ts`       | Fake test users, fake teams (added per phase). Rich enough to click through the app without manual setup. |
| `staging.ts`   | Clean QA baseline: one admin via bootstrap token. No fake users. |
| `production.ts`| Minimal bootstrap only. No users. Admin created via ADMIN_BOOTSTRAP_TOKEN flow. |
