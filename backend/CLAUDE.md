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
