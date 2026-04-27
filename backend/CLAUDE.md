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
