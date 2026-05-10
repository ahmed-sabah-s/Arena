# Backend – Claude Code Guide

## Tech Stack

- Node.js with TypeScript
- Express.js for HTTP
- tRPC v11 for type-safe RPC
- Zod for schema validation
- Raw `pg` client with custom pool supporting named parameters
- No ORM

## Database Queries

The custom pool at `src/db.ts` supports named parameters.

**Example with query():**
```typescript
import { query } from '../../db';

const users = await query<User>(
  'SELECT * FROM "user" WHERE id = :id',
  { id: userId }
);
```

**Example with transaction():**
```typescript
import { transaction } from '../../db';

const result = await transaction(async (client) => {
  const user = await client.query<User>(
    'INSERT INTO "user" (email, password) VALUES (:email, :password) RETURNING *',
    { email, password }
  );
  await client.query(
    'INSERT INTO "userRole" ("userId", "roleId") VALUES (:userId, :roleId)',
    { userId: user.rows[0].id, roleId }
  );
  return user.rows[0];
});
```

- Use `:paramName` syntax; the pool converts to positional `$1, $2, etc.`
- Always destructure a single row: `query()` returns `T[]`.
- `transaction()` runs queries inside `client` with automatic COMMIT on success or ROLLBACK on error.

⚠️ **Time-like literals in SQL.** The named-parameter regex matches `:name` patterns. Time literals like `'14:00:00'` will cause `:00:00` to be parsed as a missing parameter. Always pass times via parameters, never inline. Same applies to any literal containing `:WORD` patterns. If you must inline (rare), use the parser-safe form: `make_time(14, 0, 0)`.

```typescript
// ✅ correct
await query(
  `INSERT INTO "venueAvailabilityRules" ("venueId", "dayOfWeek", "openTime", "closeTime")
   VALUES (:venueId, :dow, :openTime, :closeTime)`,
  { venueId, dow, openTime: '16:00:00', closeTime: '22:00:00' },
);

// ❌ wrong — :00:00 inside the literal is misread as a parameter
await query(
  `INSERT INTO ... VALUES (:venueId, :dow, '16:00:00', '22:00:00')`,
  { venueId, dow },
);
```

## JSONB Parameter Binding

**Always wrap JSONB values with `JSON.stringify(...)` before passing them to `query()` / `client.query()`.** The pg driver does not serialise JS objects or arrays into JSONB on its own — it stringifies them as `[object Object]` (objects) or comma-joins (arrays) and Postgres rejects the value or stores garbage.

```typescript
// ✅ correct — stringify on the way in
await query(
  `INSERT INTO notifications ("userId", type, payload)
   VALUES (:userId, :type, :payload)`,
  {
    userId,
    type: 'match_locked',
    payload: JSON.stringify({ matchId, opponentName }),
  },
);

// ❌ wrong — pg can't serialise this
await query(`... VALUES (:userId, :type, :payload)`, {
  payload: { matchId, opponentName },
});
```

- The destination column's `JSONB` type is enough for Postgres to parse the string; you don't need a `::jsonb` cast in the SQL.
- `null` passes through fine — use `JSON.stringify(value ?? null)` so an absent optional becomes JSONB `null`, not the string `"null"` of an undefined.
- **Reads are the inverse:** the pg driver returns JSONB columns as already-parsed JS values. Never call `JSON.parse()` on them — that double-decodes and crashes on objects.
- For columns whose shape varies, type the field as a discriminated union (see TypeScript Discipline below) rather than `any`.

Existing examples in the codebase: [match.repository.ts](backend/src/domain/match/match.repository.ts) (`statValue`), [notification.repository.ts](backend/src/domain/notification/notification.repository.ts) (`payload`), [audit.repository.ts](backend/src/domain/audit/audit.repository.ts) (`details`), [elo.repository.ts](backend/src/domain/elo/elo.repository.ts) (`form`).

## BIGINT and DECIMAL columns from pg

The `pg` driver returns BIGINT and DECIMAL columns as JS strings, not numbers. Repositories that read money or large-integer columns must coerce on read. Pattern:

```ts
priceAmount: Number(row.priceAmount),
commissionPercent: Number(row.commissionPercentSnapshot),
reliabilityScore: Number(row.reliabilityScore),
```

Coercion belongs in the repository's row-to-entity mapping function, not in callers. If a third repository in a new domain needs the same pattern, extract a `coerceNumeric` helper to `backend/src/shared/numeric/`.

Existing examples: [venue-booking.repository.ts](backend/src/domain/venue-booking/venue-booking.repository.ts) (`normaliseBooking`), [venue.repository.ts](backend/src/domain/venue/venue.repository.ts) (`normaliseVenueGameConfig`), [referee.repository.ts](backend/src/domain/referee/referee.repository.ts) (`normaliseProfile`).

## SQL Conventions

- camelCase quoted identifiers: `"userId"`, `"emailVerified"`.
- UUIDs via `randomUUID()` from Node's `crypto` module, never the `uuid` package.
- UTC timestamps; `CURRENT_TIMESTAMP` is always UTC in PostgreSQL.

## tRPC Procedures

Use only two base procedures:
- `protectedProcedureWithErrorHandling` for authenticated endpoints.
- `publicProcedureWithErrorHandling` for public endpoints.

Never use bare `trpc.procedure()`. The context includes `ctx.user` for protected procedures.

```typescript
router.mutation('createPost', 
  protectedProcedureWithErrorHandling
    .input(CreatePostSchema)
    .mutation(async ({ ctx, input }) => {
      // ctx.user is guaranteed to be set
      const post = await PostService.create(input, ctx.user.id);
      return post;
    })
);
```

## Error Handling

Throw `TRPCError` or `AppError` with a code and message. Never plain strings or bare `new Error()`.

```typescript
if (!user) {
  throw new TRPCError({
    code: 'NOT_FOUND',
    message: 'User not found',
  });
}
```

## TypeScript Discipline

Established in Phase 3.5. These rules are binding for all new and modified code.

- **No `any` types.** Use `unknown` for genuinely unknown shapes and narrow before use. `any` opts out of type checking entirely; in a codebase where types are knowable from migrations, schemas, or other source files, `any` is almost always wrong.
- **No `@ts-ignore` or `@ts-expect-error`** without an inline comment explaining what error is being silenced and why it can't be fixed.
- **No unjustified `as` casts.** `as const` and post-runtime-check narrowing (e.g., `if (typeof x === 'string')` followed by use as a string) are fine. Everything else needs a one-line comment naming why the cast is required.

### Accepted exceptions (with comment)

- **Test mocks** that intentionally implement only the methods a test exercises: prefer `as unknown as IRepository` over `as any`, and add a one-line comment near the cast.
- **Library boundaries** that return `any` from third-party types (e.g., `jwt.verify`'s `string | object | T`): cast at the boundary, document the cast, and never propagate `any` into application code.
- **Generic type parameter defaults** that mean "any value": prefer `<T = unknown>`. `<T = any>` is acceptable only for ergonomic public APIs that consumers commonly call without specifying the generic (e.g., `query<MyRow>()`); the rationale must be in a comment.
- **Overload implementation signatures** for methods with multiple typed overloads: TypeScript's standard pattern uses `any` on the implementation. The overloads themselves must be properly typed.

### How to handle a JSONB column

Define a discriminated union if the shape is known and varies by a sibling column. Use `unknown` if the shape is genuinely caller-narrowed. Never use `any`.

### Postgres error narrowing

Use the `isPgError` type guard from `shared/errors`. Replace `catch (err: any)` with `catch (err: unknown)` followed by `if (isPgError(err)) ...`. Then access `err.code` (SQLSTATE) and `err.constraint` after narrowing.

## Domain Structure

Every feature is a vertical-slice folder under `src/domain/` with six files:

```
src/domain/post/
├── entity.ts        # Plain TypeScript interfaces (no methods)
├── interface.ts     # Repository interface
├── repository.ts    # SQL queries
├── service.ts       # Business logic
├── router.ts        # tRPC endpoint
└── index.ts         # Barrel export
```

- **Routers stay thin.** No SQL. No business logic.
- **Services** depend on the repository interface, never the implementation.
- **Repositories** hold SQL and nothing else.
- **Entities** are plain interfaces—no class methods.

After creating a router, register it in `src/presentation/routers/_app.ts`.

## Schemas

Zod schemas come from `@arena/shared` only. The backend has a thin re-export at `src/shared/schemas.ts` for convenience—never add schemas there directly.

## AI Guardrails

- Check `backend/database/migrations/` for the current schema before writing queries.
- Never edit applied migrations; create a new one instead.
- Import `query` and `transaction` from `../../db` in domain modules.
