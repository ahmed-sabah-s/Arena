# Naming Conventions

## 1. Branch Naming Convention

### Format
```
[scope]/[type]/[JIRA-ID]-[description]
```

### Scopes
| Scope | Targets |
|-------|---------|
| `backend` | Backend API (`backend/`) |
| `mobile` | Mobile app (`mobile/`) |
| `frontend` | Web frontend (`frontend/`) |
| `shared` | Shared package (`shared/`) |
| `fullstack` | One PR spanning multiple packages (backend + mobile/frontend) |

### Types
| Type | When to use |
|------|-------------|
| `feat` | New functionality |
| `fix` | Bug fixes |
| `perf` | Performance optimizations |
| `refactor` | Structural changes without logic changes |
| `chore` | Tooling, deps, or README updates |

### Examples
```
backend/feat/PROJ-123-auth-otp-integration
mobile/fix/PROJ-404-login-crash
frontend/perf/PROJ-88-optimize-dashboard-images
shared/feat/PROJ-55-add-order-schemas
fullstack/feat/PROJ-77-lab-orders-end-to-end
```

### Rules
- **Lower-case** everything except the Jira ID (keep e.g. `PROJ-123` upper-case so it stands out)
- **Hyphens only** — no spaces, no underscores
- **3–4 words max** for the description (details live in Jira)

---

## 2. Commit Naming (Conventional Commits)

### Format
```
type(scope): description
```

Scope reflects the **domain and layer** that changed.

### Examples
```
feat(backend/user): add permission check for audit logs
fix(mobile/presentation): fix button overlap
refactor(shared/schemas): simplify otp-validation logic
feat(mobile/orders): implement order list screen
fix(backend/auth): correct password compare logic
chore(mobile): upgrade expo sdk
feat(fullstack/lab-order): end-to-end lab order flow
```

---

## 3. Protected Branches

| Branch | Purpose | Rules |
|--------|---------|-------|
| `main` | Trunk — always deployable | 1 approval required, PR mandatory, CI must pass |
| `release/*` | Stabilizing a major version (optional) | Lead Dev only |

> **No `develop` branch.** Branch from `main`, merge back to `main` (short-lived branches).

---

## 4. Conflict Prevention

### Domain Ownership
If one developer owns `backend/src/domain/auth/`, no other developer touches that folder during the same sprint.

### Cross-Layer PRs
A feature that spans `backend/domain/user/` **and** `mobile/src/application/` must ship in **one single PR**. This ensures tRPC types never break for other developers mid-sprint.

### Daily Rebase
```bash
git pull --rebase origin main
```
Run this daily to keep history linear and avoid large merge conflicts.

---

## 5. File & Folder Naming

### Backend (`backend/src/domain/`)
```
[feature]/
├── [feature].entity.ts       # kebab-case filename, PascalCase interface
├── [feature].interface.ts
├── [feature].repository.ts
├── [feature].service.ts
├── [feature].router.ts
└── index.ts
```

### Mobile (`mobile/src/presentation/screens/`)
```
[domain]/[FeatureName]Screen.tsx   # PascalCase component name
```

### Mobile Components
```
presentation/components/ui/         # Reusable primitives (Button, Card, etc.)
presentation/components/clinical/   # Domain-specific sheets
```

### Shared Package (`shared/src/schemas/`)
- One file per domain: `[domain].schemas.ts` — e.g. `auth.schemas.ts`, `order.schemas.ts`
- Schema names: `[verb][Domain]Schema` camelCase — e.g. `createOrderSchema`, `updateUserSchema`
- Inferred type names: `[Verb][Domain]Input` PascalCase — e.g. `CreateOrderInput`, `UpdateUserInput`
- All schemas barrel-exported from `shared/src/schemas/index.ts`
- Import alias: `@shared/schemas` — **never** use relative paths to the shared folder

```
shared/src/schemas/
├── auth.schemas.ts       # loginSchema, registerSchema, ...
├── user.schemas.ts       # createUserSchema, updateUserSchema, ...
├── role.schemas.ts       # createRoleSchema, assignRoleSchema, ...
├── permission.schemas.ts # createPermissionSchema, ...
├── file.schemas.ts       # uploadFileSchema, deleteFileSchema, ...
├── [feature].schemas.ts  # add per new domain
└── index.ts              # export * from each file
```

### Database (PostgreSQL)
- **camelCase** for all table and column names: `"userId"`, `"createdAt"`, `"isActive"`
- Quote reserved words and camelCase identifiers: `"user"`, `"userRole"`, `"refreshToken"`
- Indexes: `idx_[table]_[column]` — e.g. `idx_user_email`
