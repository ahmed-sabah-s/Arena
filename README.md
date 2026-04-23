# Clean Architecture - Full Stack Template

**API + Web + Mobile** - Complete TypeScript monorepo with tRPC for type-safe communication. Build production apps fast with AI assistance.

## 🎯 What's Included

- ✅ **Backend API** - Node.js + Express + tRPC (only tRPC, no REST)
- ✅ **Web Frontend** - React 19 + Vite + Tailwind (optional)
- ✅ **Mobile App** - React Native + Expo
- ✅ **Shared Schemas** - Single Zod schema source for BE + FE + Mobile (`shared/`)
- ✅ **Shared Types** - End-to-end type safety via tRPC
- ✅ **No ORM** - Raw PostgreSQL with named parameters (`:userId` instead of `$1`)
- ✅ **AI-Optimized** - Generate SQL queries with AI
- ✅ **Optional Services** - S3, SMTP, OTP, 2FA (enable as needed)

## Architecture

```
tRPC-Template/
├── shared/               # Shared Zod schemas (single source of truth)
│   └── src/schemas/     # auth, user, role, permission, file, ...
│                        # Import via: @shared/schemas
│
├── backend/              # API Server (Node.js + tRPC)
│   ├── database/        # SQL schemas & seeds
│   └── src/
│       ├── domain/      # Domain modules (vertical slicing)
│       │   ├── user/   # User domain (entity, repository, service, router)
│       │   ├── auth/   # Authentication domain
│       │   ├── role/   # Role management domain
│       │   ├── permission/  # Permission domain
│       │   ├── file/   # File upload domain
│       │   └── audit/  # Audit logging domain
│       ├── shared/      # Cross-cutting concerns
│       │   ├── schemas.ts   # Re-exports from @shared/schemas
│       │   ├── errors/      # Custom error classes
│       │   ├── security/    # JWT, Password, 2FA services
│       │   ├── service/     # S3, SMTP, OTP
│       │   └── config/      # Environment configuration
│       └── presentation/    # tRPC setup (context, router)
│
├── frontend/            # Web App (React + Vite)
│   └── src/
│       ├── infrastructure/  # tRPC client, storage
│       ├── application/     # Hooks, business logic
│       └── presentation/    # UI components, pages
│
└── mobile/              # Mobile App (React Native + Expo)
    └── src/
        ├── infrastructure/  # tRPC client, secure storage
        ├── application/     # Hooks (same as web)
        └── presentation/    # Screens, navigation
```

## Quick Start

### 1. Prerequisites
```bash
Node.js 18+
PostgreSQL 14+
```

### 2. Environment Setup

**Backend** (`backend/.env`):
```env
# Database (2 URLs: target + admin)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/your_db"
DATABASE_ADMIN_URL="postgresql://postgres:postgres@localhost:5432/postgres"

# JWT (generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
JWT_SECRET=your-32-char-secret
JWT_REFRESH_SECRET=your-32-char-refresh-secret

NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:5173

# Optional services (uncomment if needed)
# AWS_ACCESS_KEY_ID=your-key
# SMTP_USER=your-email
# OTP_SERVICE_AUTH_TOKEN=your-token
```

**Frontend** (`frontend/.env`):
```env
VITE_API_URL=http://localhost:3000
```

**Mobile** (`mobile/.env`):
```env
# iOS Simulator: http://localhost:3000
# Android Emulator: http://10.0.2.2:3000
# Physical Device: http://YOUR_MACHINE_IP:3000
API_URL=http://localhost:3000
```

### 3. Setup & Run

```bash
# Backend
cd backend
npm install
npm run db:setup  # Auto-creates DB + tables
npm run db:seed   # Add default data
npm run dev       # http://localhost:3000/trpc

# Frontend (new terminal)
cd frontend
npm install --legacy-peer-deps  # If using TinyMCE
npm run dev       # http://localhost:5173

# Mobile (new terminal)
cd mobile
npm install
npm start         # Opens Expo dev tools
```

**Default accounts:**
- Admin: `admin@example.com` / `Admin123!`
- User: `user@example.com` / `Test123!`

---

## 📖 Code Examples

**[View Complete Examples →](./EXAMPLES.md)**

The `EXAMPLES.md` file includes:
- **Backend**: SQL queries with named parameters, creating tRPC routers, repositories
- **Frontend**: Using tRPC queries/mutations, Tailwind + shadcn/ui, React Hook Form
- **Mobile**: React Native with tRPC, authentication, navigation
- **Complete Workflows**: Step-by-step feature implementation from DB to UI

---

## 🔐 Optional Services

Configure only what you need - services auto-detect from `.env`:

```env
# Uncomment to enable AWS S3
# AWS_REGION=us-east-1
# AWS_ACCESS_KEY_ID=your-key

# Uncomment to enable SMTP
# SMTP_HOST=smtp.gmail.com
# SMTP_USER=your-email

# Uncomment to enable OTP/SMS
# OTP_SERVICE_URL=https://api.twilio.com
# OTP_SERVICE_AUTH_TOKEN=your-token

# 2FA (enabled by default)
ENABLE_2FA=true
```

Server shows status:
```
📦 Optional Services Status:
  AWS S3:     ⚠️  Disabled
  SMTP:       ⚠️  Disabled
  OTP/SMS:    ⚠️  Disabled
  2FA (TOTP): ✅ Enabled
```

---

## 🎨 UI Customization

### Frontend: Tailwind + shadcn/ui (Optional)
```bash
cd frontend
npx shadcn@latest add button dialog table
```

Remove if you prefer:
- Material UI
- Ant Design
- Your own CSS

### Mobile: React Native Paper (Optional)
```bash
cd mobile
npm install react-native-paper
```

Or use:
- NativeBase
- React Native Elements
- Your own components

---

## 📝 Zod Validation - Single Source (`shared/`)

All schemas live in `shared/src/schemas/` — one place, used by backend, frontend, and mobile.

**Setup (one-time):**
```bash
cd shared && npm install
```

**Add a new schema:**
1. Create `shared/src/schemas/[feature].schemas.ts`
2. Add `export * from './[feature].schemas'` to `shared/src/schemas/index.ts`

**Import everywhere via `@shared/schemas`:**
```typescript
// Backend (tRPC router)
import { loginSchema } from '@shared/schemas';
.input(loginSchema)

// Frontend (React Hook Form)
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, LoginInput } from '@shared/schemas';
useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

// Mobile (manual validation)
import { loginSchema } from '@shared/schemas';
const result = loginSchema.safeParse(formData);
```

`backend/src/shared/schemas.ts` is a thin re-export — existing backend imports keep working unchanged.

---

## 🗄️ Database Commands

```bash
cd backend

npm run db:setup   # Auto-creates DB + tables
npm run db:seed    # Add default data
npm run db:reset   # Drop + recreate + seed (fresh start)
```

**Two connection strings required:**
- `DATABASE_URL` - Your app database
- `DATABASE_ADMIN_URL` - Admin connection (for creating DB)

**Database naming convention (backend & AI):** Use **camelCase** for all table and column names in PostgreSQL. Quote identifiers in SQL where needed (e.g. `"user"`, `"userRole"`, `"createdAt"`, `"userId"`). This matches the TypeScript/backend style and avoids snake_case ↔ camelCase mapping.

---

## 🤖 AI-Assisted Development

This template is optimized for AI code generation:

### Generate SQL Queries
Ask AI to generate optimized PostgreSQL queries using named parameters (`:paramName`). The natural syntax makes it easy for AI to understand your intent.

### Generate tRPC Procedures
AI can generate complete tRPC routers with validation, error handling, and database operations.

### Generate UI Components
For web (Tailwind + shadcn) or mobile (React Native), AI can create type-safe components that integrate with your tRPC backend.

**[See AI Prompts & Examples →](./EXAMPLES.md#ai-generated-complex-queries)**

---

## 🏗️ Project Setup Checklist

### Phase 1: Initial Setup
- [ ] Clone this template
- [ ] Update `package.json` names (backend, frontend, mobile)
- [ ] Generate JWT secrets
- [ ] Configure `.env` files
- [ ] Initialize git

### Phase 2: Database
- [ ] Ensure PostgreSQL is running
- [ ] Update `DATABASE_URL` in backend/.env
- [ ] Run `npm run db:setup` (auto-creates DB)
- [ ] Run `npm run db:seed`

### Phase 3: Optional Services (Enable as Needed)
- [ ] AWS S3 (uncomment in .env if needed)
- [ ] SMTP (uncomment if sending emails)
- [ ] OTP/SMS (uncomment if sending SMS)
- [ ] 2FA (enabled by default)

### Phase 4: Customization
- [ ] Review `database/schema.sql` - modify tables
- [ ] Review `database/seed.sql` - update default data
- [ ] Choose UI library (Tailwind, Material UI, etc.)
- [ ] Update branding/colors

### Phase 5: Add Features
- [ ] Add schemas to `shared/src/schemas/[feature].schemas.ts` and barrel-export from `shared/src/schemas/index.ts`
- [ ] Add tables to `database/schema.sql`
- [ ] Create new domain folder in `domain/`
- [ ] Add entity, repository, service, router files
- [ ] Export from domain's `index.ts`
- [ ] Register router in `presentation/routers/_app.ts`
- [ ] Build UI (web + mobile)

---

## 📱 Mobile Development

### Run on Different Platforms

```bash
cd mobile

# iOS Simulator
npm run ios

# Android Emulator
npm run android

# Expo Go (physical device)
npm start  # Scan QR code
```

### API URL Configuration

Edit `mobile/src/infrastructure/api/client.ts`:

```typescript
// iOS Simulator
const API_URL = "http://localhost:3000";

// Android Emulator
const API_URL = "http://10.0.2.2:3000";

// Physical Device (find your IP with: ipconfig getifaddr en0)
const API_URL = "http://192.168.1.100:3000";
```

### Mobile Navigation

Add screens to `mobile/src/presentation/screens/` and register in `AppNavigator.tsx`:

```typescript
<Stack.Screen 
  name="Products" 
  component={ProductsScreen}
  options={{ title: "Products" }}
/>
```

---

## 🎯 Best Practices

1. **Domain-Based Organization** - Each domain (user, auth, role, etc.) contains all its layers in one folder
2. **One Schema, One Place** - `backend/src/shared/schemas.ts`
3. **Named Parameters** - `:paramName` in all SQL
4. **Optional Services** - Only enable what you need
5. **AI for SQL** - Generate optimized queries
6. **Type Safety** - tRPC ensures types match everywhere
7. **Clean Architecture** - Maintain layer separation within each domain
8. **Shared Code** - Web and mobile use same API

## 📁 Domain Structure

Each domain follows Clean Architecture principles within its own folder:

```
backend/src/domain/user/
├── user.entity.ts      # Core - Domain entities (interfaces)
├── user.interface.ts   # Core - Repository contracts
├── user.dto.ts         # Application - Data Transfer Objects
├── user.mapper.ts      # Application - Entity ↔ DTO mapping
├── user.repository.ts  # Infrastructure - Database implementation
├── user.service.ts     # Application - Business logic
├── user.router.ts      # Presentation - tRPC endpoints
└── index.ts            # Barrel export
```

**Benefits:**
- ✅ **High Cohesion** - All User code in one place
- ✅ **Easy Navigation** - Find everything about a feature quickly
- ✅ **AI-Friendly** - AI can see full context in one directory
- ✅ **Independent Scaling** - Modify User without touching Product
- ✅ **Clear Boundaries** - Domains communicate through clean interfaces

---

## 📦 Scripts Reference

### Backend
```bash
npm run dev       # Dev server
npm run build     # Production build
npm run db:setup  # Create DB + tables
npm run db:seed   # Add default data
npm run db:reset  # Fresh start
```

### Frontend
```bash
npm run dev       # Vite dev server
npm run build     # Production build
```

### Mobile
```bash
npm start         # Expo dev tools
npm run ios       # iOS simulator
npm run android   # Android emulator
```

---

## 🐛 Troubleshooting

**Backend won't start:**
- Check PostgreSQL is running
- Verify `.env` has both DATABASE_URL and DATABASE_ADMIN_URL
- Run `npm run db:setup`

**Mobile can't connect to API:**
- iOS Simulator: Use `http://localhost:3000`
- Android Emulator: Use `http://10.0.2.2:3000`
- Physical Device: Use your machine's IP `http://192.168.1.X:3000`
- Make sure backend is running!

**Named parameter error:**
```typescript
// ✅ Correct
query(`WHERE id = :userId`, { userId })

// ❌ Wrong
query(`WHERE id = :userId`, { id }) // Error: Missing parameter: userId
```

**Type errors in frontend/mobile:**
- Restart backend server
- Clear cache and restart dev server
- Check import path to AppRouter type

---

## 📚 Additional Resources

- **Mobile README**: See `mobile/README.md` for mobile-specific details
- **PostgreSQL Docs**: https://www.postgresql.org/docs/
- **tRPC Docs**: https://trpc.io/docs
- **React Native**: https://reactnative.dev/
- **Expo**: https://docs.expo.dev/

---

## 🎯 What Makes This Template Great

- ✅ **Type-Safe**: tRPC provides end-to-end types (API → Web → Mobile)
- ✅ **Fast**: Raw SQL is faster than any ORM
- ✅ **AI-Friendly**: Named parameters (`:param`) are natural for AI
- ✅ **Clean**: Single source of truth for schemas
- ✅ **Flexible**: Enable only the services you need
- ✅ **DX**: Same code works in web and mobile
- ✅ **Simple**: One command to setup everything

---

**Built for speed, maintained for quality** 🚀

```bash
# Backend
cd backend && npm run db:setup && npm run db:seed && npm run dev

# Frontend
cd frontend && npm install && npm run dev

# Mobile
cd mobile && npm install && npm start
```

All three apps connected via tRPC - fully type-safe!
