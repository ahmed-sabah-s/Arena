# Phase 3.5 — Typesafety Cleanup & Git Workflow

Two-pronged housekeeping phase between Phase 3 (teams) and Phase 4 (ELO engine):

1. Establish a per-phase git branch workflow with clean conventional commits.
2. Sweep accumulated `any` types from the backend and document the new typescript discipline.

## Git Workflow Established

- Baseline commit `3dbb6d5` on `main` captures the cumulative state of Phases 0–3.
- Phase 3.5 branch: `phase/3.5-typesafety-cleanup` (8 commits before this summary).
- Convention documented in `/CLAUDE.md` under **Git Workflow**.
- Going forward: every phase opens its own branch off `main` named `phase/N-short-description`. Per-phase summary committed to `/docs/phases/phase-N.md` before the branch is ready to merge.

## TypeScript Audit

Roughly 50 backend `any` occurrences inventoried before fixes. Categories:

| Category | Count | Action |
|----------|-------|--------|
| `catch (err: any)` for pg errors | 5 | Replaced with `catch (err: unknown)` + `isPgError()` narrowing |
| `query<any>(rolesQuery, …)` | 5 | Typed as `UserRoleRow` / `RoleQueryRow` |
| `mapRow(row: any)` | 1 | Typed input |
| `Record<string, any>` for query-params builders | 5 | `Record<string, unknown>` |
| `details: any` on auditLog | 3 | `details: unknown` |
| `team.repository.ts` `exec<T = any>` | 1 | `exec<T extends pg.QueryResultRow>` |
| `db.ts` `convertNamedParams` | 2 | params/values now `unknown` |
| Frontend/mobile auth storage `getUser/setUser: any` | 4 | `unknown` |
| Mobile `useAuth` `user: any` | 2 | `StoredAuthUser` structural interface |
| Mobile `HomeScreen` `user?.name` | 1 | Fixed legacy reference to `fullName` |
| Test mocks `(repo.create as any).mock.calls` | 1 | `vi.mocked(repo.create).mock.calls` |
| Test mocks `transaction: vi.fn(... cb: any)` | 2 | `cb: (client: unknown) => …` |
| Test mocks `mockImplementation(...) as any` | 12 | `as unknown as typeof query` (documented at top of file) |

### Justified `any` retained (with comments)

- **Forwarding constructor** `CustomClient(...args: any[])` — pg's `Client` has many constructor overloads; typed forwarding via `ConstructorParameters<typeof Client>` is fragile across `@types/pg` revisions.
- **Overload implementation signatures** in `db.ts` `query()` — TypeScript's standard pattern uses `any` on the implementation while overload declarations carry the real types.
- **Generic defaults** `<T extends pg.QueryResultRow = any>` on the public `query()` and pool/client overloads — keeps no-generic call sites ergonomic; consumers narrow via `query<MyRow>(...)`.

### `as` casts

Audited and documented:

- `getConfig.ts` typed readers cast `row.value as <T>` after `assertType(row, expected)` runtime check. Comment added explaining the post-check narrowing pattern.
- `JwtService.ts` casts to `JwtPayload` on object literals (preserves literal types in the signed payload) and on `jwt.verify()` returns (narrows the `string | object | T` boundary). Comment added explaining both patterns.
- `'phone_change' as OtpPurpose` removed — TypeScript narrows the literal to the union member directly without the cast.

No `@ts-ignore` or `@ts-expect-error` comments existed anywhere in the repo at audit time.

## New Conventions Documented

- `/CLAUDE.md` gains a **Git Workflow** section.
- `/backend/CLAUDE.md` gains a **TypeScript Discipline** section covering: no `any`, no unjustified `@ts-ignore`/`@ts-expect-error`, no unjustified casts, accepted exceptions, JSONB handling, and pg-error narrowing.

## Commits on `phase/3.5-typesafety-cleanup`

```
docs: add git workflow rules to root CLAUDE.md
refactor: type pg DatabaseError catches via isPgError narrowing
refactor: type audit.details as unknown instead of any
refactor: tighten params, exec helper, and storage user types
refactor: type test mock callbacks and document query-mock cast
refactor: justify or remove unjustified type escape hatches
docs: add TypeScript discipline section to backend CLAUDE.md
refactor: comment TestClient query override pattern
docs: add phase-3.5 summary  ← this commit
```

## Verification

- `pnpm install` succeeds.
- `pnpm -r typecheck` passes across all four packages.
- `pnpm --filter ./backend test` — 56/56 unit tests pass.
- `pnpm --filter ./backend test:integration` — 7/7 integration tests pass.
- Remaining `any` uses in `backend/src` all carry justifying comments and fall into the documented exception categories.

## Future-Phase Items Noticed

- The `frontend/src/application/hooks/useAuth.ts` and mobile equivalents could narrow user storage to a typed `User` from `@arena/shared` once Phase 9/11 rebuilds the auth UI. Currently using a `StoredAuthUser` structural minimum.
- `getConfig` typed readers still cast at the boundary; once admin dashboard (Phase 8) lets us trust shape uniformity per key, we can move toward a registry-driven approach with stronger typing.
- No runtime bugs were surfaced by the typing changes. The pre-existing logic under the `any`s held up under tighter constraints.

**Ready for Phase 4: YES**
