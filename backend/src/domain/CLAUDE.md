# Domain Layer – Claude Code Guide

## Vertical-Slice Discipline

Every feature is a self-contained folder with six files:

```
src/domain/post/
├── entity.ts        # TypeScript interface (no logic)
├── interface.ts     # Repository interface contract
├── repository.ts    # SQL and database access only
├── service.ts       # Business logic and validation
├── router.ts        # tRPC endpoints (thin)
└── index.ts         # Barrel export
```

## File Responsibilities

### entity.ts
Plain TypeScript interfaces. No class methods, no logic, no database code.

```typescript
export interface Post {
  id: string;
  userId: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### interface.ts
Repository interface that services depend on. Defines the contract.

```typescript
export interface IPostRepository {
  create(post: Omit<Post, 'id' | 'createdAt' | 'updatedAt'>): Promise<Post>;
  findById(id: string): Promise<Post | null>;
  list(filters: ListFilters): Promise<Post[]>;
  update(id: string, updates: Partial<Post>): Promise<Post>;
}
```

### repository.ts
SQL queries and database access. No business logic here.

```typescript
import { query, transaction } from '../../../db';

export class PostRepository implements IPostRepository {
  async create(post: any): Promise<Post> {
    const result = await query<Post>(
      'INSERT INTO post (title, content, "userId") VALUES (:title, :content, :userId) RETURNING *',
      post
    );
    return result[0];
  }

  async findById(id: string): Promise<Post | null> {
    const result = await query<Post>('SELECT * FROM post WHERE id = :id', { id });
    return result[0] || null;
  }
}
```

### service.ts
Business logic, validation, orchestration. Depends on the repository interface, not the implementation.

```typescript
export class PostService {
  constructor(private repo: IPostRepository) {}

  async create(input: CreatePostSchema, userId: string): Promise<Post> {
    // validation, side effects, etc.
    if (!input.title.trim()) {
      throw new AppError('Title is required', 'VALIDATION_ERROR');
    }

    const post = await this.repo.create({
      title: input.title,
      content: input.content,
      userId,
    });

    return post;
  }
}
```

### router.ts
tRPC endpoints. Thin—no SQL, no business logic.

```typescript
export const postRouter = router({
  create: protectedProcedureWithErrorHandling
    .input(CreatePostSchema)
    .mutation(async ({ ctx, input }) => {
      const service = new PostService(new PostRepository());
      return service.create(input, ctx.user.id);
    }),
});
```

### index.ts
Barrel export for clean imports.

```typescript
export * from './entity';
export * from './interface';
export * from './repository';
export * from './service';
export * from './router';
```

## Rules

- **Routers stay thin.** Call services; services orchestrate repositories.
- **Services depend on the interface.** Inject the repo interface for testability.
- **Repositories hold SQL.** No business logic.
- **Never import implementation details** from repositories in routers; use the service.

## Registration

After creating a router, register it in `src/presentation/routers/_app.ts`:

```typescript
export const appRouter = router({
  post: postRouter,
  user: userRouter,
  // …
});
```
