# Shared Package – Claude Code Guide

## Purpose

Single source of truth for Zod schemas and shared types used by backend, frontend, and mobile. Published as `@arena/shared`.

## What Lives Here

- Zod schemas for all entities and API contracts.
- Inferred TypeScript types (via `z.infer<typeof Schema>`).
- Shared enums and constants that don't belong in `platformConfig`.

## What Does NOT Live Here

- Runtime logic or business calculations.
- Environment-specific values (URLs, keys, etc.).
- Node-only APIs (`fs`, `crypto`, etc.).
- React or React Native imports.
- Database queries or migrations.

Must be safely importable from browser, server, and React Native without surprises.

## Structure

One file per feature using the convention:

```
src/schemas/
├── index.ts              # Barrel export
├── user.schemas.ts
├── post.schemas.ts
├── team.schemas.ts
└── …
```

## Naming

- **Files:** dot separator (e.g. `user.schemas.ts`).
- **Schemas:** PascalCase ending in `Schema` (e.g. `CreatePostSchema`).
- **Inferred types:** drop the `Schema` suffix (e.g. `CreatePost`).
- **Union enums:** PascalCase (e.g. `PostStatus`).

Example:
```typescript
// user.schemas.ts
export const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export type CreateUser = z.infer<typeof CreateUserSchema>;

export const UserRole = z.enum(['admin', 'user', 'guest']);
export type UserRole = z.infer<typeof UserRole>;
```

## Rules

- **Export all schemas** from `src/schemas/index.ts`.
- **Never duplicate** schemas; always reuse from this package.
- **Never add runtime dependencies.** Keep dependencies minimal (only Zod).
- **Update order:** schema first, then database migration, then tRPC procedures.

Example workflow for adding a field:
1. Update schema in `@arena/shared`.
2. Create database migration in `backend/database/migrations/`.
3. Update backend tRPC procedures.
4. Update frontend/mobile code to use the new field.
