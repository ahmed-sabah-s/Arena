# Frontend – Claude Code Guide

## Tech Stack

- React 19, Vite, TypeScript
- Tailwind CSS + shadcn/ui
- React Router for navigation
- tRPC React Query for server state
- React Hook Form + Zod for forms

## Arena Design System

### Surface Hierarchy (Stacked, No Borders)
- **pitch** (#000000) – global background
- **turf** (#0c0e11) – main content areas
- **bench** (#171a1d) – cards, list items
- **suite** (#23262a) – active states, elevated

### Color Semantics
- **primary** (#cafd00 lime) – success, CTAs, active states
  - Text on primary: use `text-pitch` or `text-on-fixed`
- **secondary** (#00e3fd cyan) – data display only, never actions
- **tertiary** (#fc3c00 orange-red) – danger, decline
- **on-surface** (#f9f9fd) – body text, never pure white

### Layout Rules
- No 1px solid borders for separation; use background color hierarchy instead.
- No rounded corners above 0.75rem; cap at `rounded-lg`.
- No drop shadows; elevation via color and spacing.

## Page Structure

Never mix action mode and listing mode on the same screen. Create separate views.

```
src/presentation/
├── pages/        # Full-page components
├── components/   # Reusable UI components
│   ├── ui/       # shadcn/ui primitives
│   └── arena/    # Arena-specific composed components
└── routes/       # Router config
```

## Components

- Functional components only.
- Tailwind classes only; no inline styles.
- Reuse from `src/presentation/components/ui/` (shadcn) before creating new.
- Create domain-specific components in `src/presentation/components/arena/`.

## Forms

Use React Hook Form + Zod resolver with schemas from `@arena/shared`:

```typescript
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { CreatePostSchema } from '@arena/shared';

export function CreatePostForm() {
  const form = useForm({
    resolver: zodResolver(CreatePostSchema),
  });

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      {/* form fields */}
    </form>
  );
}
```

## tRPC Integration

Import the client from `@/infrastructure/api/trpc`. Cache invalidation via `trpc.useUtils()`:

```typescript
import { trpc } from '@/infrastructure/api/trpc';

export function PostCard({ post }) {
  const utils = trpc.useUtils();
  const deleteMutation = trpc.post.delete.useMutation({
    onSuccess: () => {
      utils.post.list.invalidate();
    },
  });

  return (
    <button onClick={() => deleteMutation.mutate(post.id)}>
      Delete
    </button>
  );
}
```

Mutations always include `onSuccess` invalidation. Optimistic updates for list mutations when appropriate.

## Query Handling

Every `useQuery` must handle `isLoading` (show skeleton) and `error`:

```typescript
const { data, isLoading, error } = trpc.post.list.useQuery();

if (isLoading) return <PostsSkeleton />;
if (error) return <ErrorBanner message={error.message} />;

return <PostList posts={data} />;
```

## Routing

Register new pages in `src/presentation/routes/` before adding them to navigation.

## AI Guardrails

- Check existing UI components before creating new ones.
- Register new pages in the router.
- Never import from `backend/`; always use `@arena/shared`.
