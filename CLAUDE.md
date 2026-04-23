# Arena Monorepo – Claude Code Guide

Arena is a competitive real-life gaming platform for Iraq and the region. Any game can be added as data; games are never hardcoded into application logic.

## Monorepo Structure

This is a pnpm workspace with four packages:

- `backend/` – Node.js, Express, tRPC, raw PostgreSQL with named parameters
- `frontend/` – React 19, Vite, Tailwind, shadcn/ui
- `mobile/` – React Native, Expo, NativeWind
- `shared/` – Zod schemas and shared types; published as `@arena/shared`

Install dependencies at the root: `pnpm install`. Never `npm install` inside a package.

## Language & Localization

Arabic-first, RTL-first. English is secondary. All user-facing strings are internationalized. Never hardcode text for display.

## Money & Amounts

Money is always stored as:
- `amount` (BIGINT) – the numeric value
- `currency` (VARCHAR(3)) – the code (e.g. "IQD")

Display and transaction amounts are always rounded through a single utility. IQD rounds up to the nearest 250. Never round non-money values.

## Configuration & Business Logic

All game behavior, pricing, thresholds, and feature flags live in the `platformConfig` table. Never hardcode magic numbers for business rules. Every monetization stream has a feature flag; if off, the feature is invisible—no stubs, no errors.

## Environment Awareness

The app knows its environment via `ENVIRONMENT_NAME` (dev | staging | production). Destructive actions require typed confirmation in every environment, not just production.

## Shared Schemas

Shared Zod schemas live in `@arena/shared`. Never duplicate. Never cross-import between backend/frontend/mobile—always go through the shared package.

## Database

- Raw SQL only; no ORM.
- camelCase quoted identifiers (e.g. `"userId"`).
- Named parameters via `:paramName` syntax (backend's custom pool supports this).
- UUIDs via `randomUUID()` from Node's `crypto` module.
- Timestamps in UTC; soft-delete only on users/teams/venues.

## Security Basics

- No secrets committed.
- JWT tokens are short-lived (access), refresh tokens have longer TTL.
- OTP is rate-limited and hashed.
- Admin actions are audited.

## Reference Documents

- [README.md](README.md) – Project overview
- [NAMING-CONVENTION.md](NAMING-CONVENTION.md) – Code style and naming rules
- [EXAMPLES.md](EXAMPLES.md) – Patterns and examples

## AI Guardrails

Before writing code:
- Check `backend/database/migrations/` for the current schema before writing queries.
- Check `@arena/shared` for existing schemas before creating new ones.
- If you're about to hardcode a number that looks like a price/percent/threshold, it probably belongs in `platformConfig`.
