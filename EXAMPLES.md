# Code Examples

Complete examples for backend, web, and mobile development with tRPC.

## Table of Contents

- [Shared Schemas](#shared-schemas)
  - [Structure](#structure)
  - [Adding a New Schema](#adding-a-new-schema)
  - [Importing Schemas](#importing-schemas)
- [Backend Examples](#backend-examples)
  - [SQL Queries with Named Parameters](#sql-queries-with-named-parameters)
  - [Creating tRPC Procedures](#creating-trpc-procedures)
  - [Repository Pattern](#repository-pattern)
- [Frontend Examples](#frontend-examples)
  - [Using tRPC Queries](#using-trpc-queries)
  - [Using tRPC Mutations](#using-trpc-mutations)
  - [With Tailwind + shadcn/ui](#with-tailwind--shadcnui)
  - [React Hook Form Integration](#react-hook-form-integration)
- [Mobile Examples](#mobile-examples)
  - [Using tRPC in React Native](#using-trpc-in-react-native)
  - [Authentication Flow](#authentication-flow)
  - [Navigation](#navigation)
- [Complete Feature Example](#complete-feature-example)
  - [1. Define Schema](#1-define-validation-schema)
  - [2. Create Table](#2-add-database-table)
  - [3. Create Repository](#3-create-repository)
  - [4. Create Router](#4-create-trpc-router)
  - [5. Use in Web](#5-use-in-frontend)
  - [6. Use in Mobile](#6-use-in-mobile)

---

## Shared Schemas

All Zod validation schemas live in `shared/src/schemas/` — the **single source of truth** for backend, frontend, and mobile. Never duplicate schemas; always import from `@shared/schemas`.

### Structure

```
shared/
└── src/
    └── schemas/
        ├── auth.schemas.ts        # login, register, 2FA, password reset
        ├── user.schemas.ts        # createUser, updateUser, pagination
        ├── role.schemas.ts        # createRole, assignRole, ...
        ├── permission.schemas.ts  # createPermission, updatePermission, ...
        ├── file.schemas.ts        # uploadFile, deleteFile
        └── index.ts               # barrel export (export * from each file)
```

### Adding a New Schema

1. Create `shared/src/schemas/[feature].schemas.ts`:

```typescript
// shared/src/schemas/order.schemas.ts
import { z } from 'zod';

export const createOrderSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  notes: z.string().optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
```

2. Barrel-export it in `shared/src/schemas/index.ts`:

```typescript
export * from './auth.schemas';
// ... existing exports ...
export * from './order.schemas'; // add new domain here
```

That's it — the schema is now available in backend, frontend, and mobile via `@shared/schemas`.

### Importing Schemas

**Backend (tRPC router):**
```typescript
import { createOrderSchema, CreateOrderInput } from '@shared/schemas';

export const orderRouter = router({
  create: protectedProcedureWithErrorHandling
    .input(createOrderSchema)
    .mutation(async ({ input, ctx }) => {
      // input is fully typed as CreateOrderInput
      return orderService.create({ ...input, userId: ctx.user.id });
    }),
});
```

**Frontend (React Hook Form):**
```typescript
import { zodResolver } from '@hookform/resolvers/zod';
import { createOrderSchema, CreateOrderInput } from '@shared/schemas';

function OrderForm() {
  const { register, handleSubmit, formState: { errors } } = useForm<CreateOrderInput>({
    resolver: zodResolver(createOrderSchema),
  });
}
```

**Mobile (React Native form validation):**
```typescript
import { createOrderSchema } from '@shared/schemas';

const result = createOrderSchema.safeParse(formData);
if (!result.success) {
  // result.error.issues — fully typed validation errors
}
```

---

## Backend Examples

### SQL Queries with Named Parameters

Use `:paramName` syntax instead of `$1, $2, ...` for better readability:

```typescript
import { query } from "../../db";

// Single row — use array destructuring
const [user] = await query(
  `SELECT * FROM "user" WHERE email = :email`,
  { email: 'user@example.com' }
);

// Multiple rows
const users = await query(
  `SELECT * FROM "user"
   WHERE is_active = :active
   AND created_at > :startDate
   LIMIT :limit`,
  { active: true, startDate: '2024-01-01', limit: 10 }
);

// INSERT with RETURNING — destructure to get the created record
const [newUser] = await query(
  `INSERT INTO "user" (email, password, name)
   VALUES (:email, :password, :name)
   RETURNING *`,
  { email, password: hashedPassword, name }
);

// UPDATE — destructure to get updated record
const [updated] = await query(
  `UPDATE "user"
   SET name = :name, updated_at = CURRENT_TIMESTAMP
   WHERE id = :userId
   RETURNING *`,
  { name: 'New Name', userId }
);

// DELETE
await query(
  `DELETE FROM "user" WHERE id = :userId`,
  { userId }
);

// Complex JOIN with aggregation
const usersWithRoles = await query(`
  SELECT
    u.id,
    u.email,
    u.name,
    json_agg(
      json_build_object(
        'id', r.id,
        'name', r.name,
        'permissions', r.permissions
      )
    ) as roles
  FROM "user" u
  LEFT JOIN user_role ur ON u.id = ur.user_id
  LEFT JOIN role r ON ur.role_id = r.id
  WHERE u.is_active = :active
  GROUP BY u.id
  ORDER BY u.created_at DESC
  LIMIT :limit OFFSET :offset
`, { active: true, limit: 20, offset: 0 });

// Transactions
import { transaction } from "../../db";

await transaction(async (client) => {
  // All queries in this block use the same transaction
  const order = await client.query(
    `INSERT INTO orders (user_id, total) 
     VALUES (:userId, :total) 
     RETURNING *`,
    { userId, total }
  );

  await client.query(
    `UPDATE products SET stock = stock - :quantity 
     WHERE id = :productId`,
    { quantity, productId }
  );

  return order;
});
```

### AI-Generated Complex Queries

**Prompt to AI:**
```
Generate PostgreSQL query with named parameters to:
- Get users with roles and recent orders
- Use :userId parameter
- Optimize with JOINs and indexes

Tables: user, role, user_role, order
```

**AI Response:**
```typescript
const [result] = await query(`
  SELECT
    u.id,
    u.name,
    u.email,
    json_agg(DISTINCT jsonb_build_object(
      'id', r.id,
      'name', r.name
    )) FILTER (WHERE r.id IS NOT NULL) as roles,
    (
      SELECT json_agg(o.*)
      FROM (
        SELECT id, total, status, created_at
        FROM "order"
        WHERE user_id = u.id
        ORDER BY created_at DESC
        LIMIT 5
      ) o
    ) as recent_orders,
    COUNT(DISTINCT o2.id) as total_orders
  FROM "user" u
  LEFT JOIN user_role ur ON u.id = ur.user_id
  LEFT JOIN role r ON ur.role_id = r.id
  LEFT JOIN "order" o2 ON u.id = o2.user_id
  WHERE u.id = :userId
  GROUP BY u.id
`, { userId });

// Recommended indexes:
// CREATE INDEX idx_order_user_id_created ON "order"(user_id, created_at DESC);
// CREATE INDEX idx_user_role_user ON user_role(user_id);
```

### Creating tRPC Procedures

#### Basic Query and Mutation

```typescript
// Example: backend/src/domain/product/product.router.ts
import { router, protectedProcedure, publicProcedure } from '../../presentation/trpc';
import { z } from 'zod';
import { query } from '../../db';

export const productRouter = router({
  // Public query - no auth required
  getAll: publicProcedure.query(async () => {
    return query(`SELECT * FROM product ORDER BY created_at DESC`);
  }),

  // Query with input validation — destructure for single row
  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const [product] = await query(
        `SELECT * FROM product WHERE id = :id`,
        { id: input.id }
      );
      return product ?? null;
    }),

  // Protected mutation - requires authentication
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(2),
      price: z.number().positive(),
      stock: z.number().int().min(0),
    }))
    .mutation(async ({ input, ctx }) => {
      const [product] = await query(
        `INSERT INTO product (name, price, stock, created_by)
         VALUES (:name, :price, :stock, :createdBy)
         RETURNING *`,
        { ...input, createdBy: ctx.user.id }
      );
      return product;
    }),

  // Update with permission check
  update: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(2).optional(),
      price: z.number().positive().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const [product] = await query(
        `SELECT * FROM product WHERE id = :id`,
        { id: input.id }
      );

      if (product.created_by !== ctx.user.id && !ctx.user.isAdmin) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Not authorized to update this product'
        });
      }

      const updates: string[] = [];
      const params: any = { id: input.id };

      if (input.name) { updates.push('name = :name'); params.name = input.name; }
      if (input.price) { updates.push('price = :price'); params.price = input.price; }

      const [updated] = await query(
        `UPDATE product
         SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
         WHERE id = :id
         RETURNING *`,
        params
      );
      return updated;
    }),
});
```

#### Advanced: With Audit Logging

```typescript
export const orderRouter = router({
  updateStatus: protectedProcedure
    .input(z.object({
      orderId: z.string().uuid(),
      status: z.enum(['pending', 'processing', 'completed', 'cancelled']),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      return transaction(async (client) => {
        // Update order
        const order = await client.query(
          `UPDATE orders 
           SET status = :status, updated_at = CURRENT_TIMESTAMP
           WHERE id = :orderId
           RETURNING *`,
          { status: input.status, orderId: input.orderId }
        );

        // Log audit trail
        await client.query(
          `INSERT INTO audit_logs (user_id, action, resource, resource_id, details)
           VALUES (:userId, :action, :resource, :resourceId, :details)`,
          {
            userId: ctx.user.id,
            action: 'order_status_updated',
            resource: 'orders',
            resourceId: input.orderId,
            details: JSON.stringify({
              old_status: order.rows[0].status,
              new_status: input.status,
              notes: input.notes,
            }),
          }
        );

        return order.rows[0];
      });
    }),
});
```

### Repository Pattern

```typescript
// Example: backend/src/domain/product/product.repository.ts
import { query, transaction } from "../../db";

export class ProductRepository {
  async findAll(filters?: { category?: string; inStock?: boolean }) {
    let sql = `SELECT * FROM product WHERE 1=1`;
    const params: any = {};

    if (filters?.category) {
      sql += ` AND category = :category`;
      params.category = filters.category;
    }
    if (filters?.inStock !== undefined) {
      sql += ` AND stock > 0`;
    }

    sql += ` ORDER BY created_at DESC`;
    return query(sql, params);
  }

  async findById(id: string) {
    const [product] = await query(`SELECT * FROM product WHERE id = :id`, { id });
    return product ?? null;
  }

  async create(data: { name: string; price: number; stock: number; createdBy: string }) {
    const [product] = await query(
      `INSERT INTO product (name, price, stock, created_by)
       VALUES (:name, :price, :stock, :createdBy)
       RETURNING *`,
      data
    );
    return product;
  }

  async updateStock(productId: string, quantity: number) {
    return transaction(async (client) => {
      const result = await client.query(
        `SELECT stock FROM product WHERE id = :productId FOR UPDATE`,
        { productId }
      );
      const [product] = result.rows;

      if (product.stock < quantity) {
        throw new Error('Insufficient stock');
      }

      return client.query(
        `UPDATE product
         SET stock = stock - :quantity
         WHERE id = :productId
         RETURNING *`,
        { quantity, productId }
      );
    });
  }
}
```

---

## Frontend Examples

### Using tRPC Queries

```typescript
import { trpc } from '@/infrastructure/api/trpc';

function ProductsPage() {
  // Simple query
  const { data: products, isLoading, error } = trpc.product.getAll.useQuery();

  // Query with parameters
  const { data: product } = trpc.product.getById.useQuery({ 
    id: '123' 
  });

  // Conditional query (only fetch when ready)
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: details } = trpc.product.getById.useQuery(
    { id: selectedId! },
    { enabled: !!selectedId }
  );

  // Polling (refetch every 5 seconds)
  const { data: liveData } = trpc.product.getAll.useQuery(
    undefined,
    { refetchInterval: 5000 }
  );

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      {products?.map(p => (
        <div key={p.id} onClick={() => setSelectedId(p.id)}>
          {p.name} - ${p.price}
        </div>
      ))}
    </div>
  );
}
```

### Using tRPC Mutations

```typescript
import { trpc } from '@/infrastructure/api/trpc';

function CreateProductForm() {
  const utils = trpc.useUtils();
  
  const createProduct = trpc.product.create.useMutation({
    // Optimistic update
    onMutate: async (newProduct) => {
      await utils.product.getAll.cancel();
      const previousProducts = utils.product.getAll.getData();
      
      utils.product.getAll.setData(undefined, (old) => [
        ...old || [],
        { ...newProduct, id: 'temp-id' }
      ]);
      
      return { previousProducts };
    },
    
    // On error, rollback
    onError: (err, newProduct, context) => {
      utils.product.getAll.setData(undefined, context?.previousProducts);
    },
    
    // On success, invalidate and refetch
    onSuccess: () => {
      utils.product.getAll.invalidate();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createProduct.mutate({
      name: 'New Product',
      price: 99.99,
      stock: 100,
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <button type="submit" disabled={createProduct.isPending}>
        {createProduct.isPending ? 'Creating...' : 'Create'}
      </button>
      {createProduct.isError && (
        <p>Error: {createProduct.error.message}</p>
      )}
    </form>
  );
}
```

### With Tailwind + shadcn/ui

```typescript
import { trpc } from '@/infrastructure/api/trpc';
import { Button } from '@/presentation/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/presentation/components/ui/card';
import { Badge } from '@/presentation/components/ui/badge';
import { Trash2, Edit } from 'lucide-react';

function ProductCard({ product }: { product: Product }) {
  const utils = trpc.useUtils();
  
  const deleteProduct = trpc.product.delete.useMutation({
    onSuccess: () => {
      utils.product.getAll.invalidate();
    },
  });

  const updateStock = trpc.product.updateStock.useMutation({
    onSuccess: () => {
      utils.product.getAll.invalidate();
    },
  });

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex justify-between items-start">
          <CardTitle>{product.name}</CardTitle>
          <Badge variant={product.stock > 0 ? 'default' : 'destructive'}>
            {product.stock > 0 ? 'In Stock' : 'Out of Stock'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-gray-600 mb-4">{product.description}</p>
        
        <div className="flex justify-between items-center">
          <span className="text-2xl font-bold text-green-600">
            ${product.price}
          </span>
          
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Edit className="h-4 w-4" />
            </Button>
            <Button 
              variant="destructive" 
              size="sm"
              onClick={() => deleteProduct.mutate({ id: product.id })}
              disabled={deleteProduct.isPending}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="mt-4">
          <p className="text-sm text-gray-600">Stock: {product.stock}</p>
          <Button 
            className="mt-2 w-full"
            onClick={() => updateStock.mutate({ 
              id: product.id, 
              quantity: 1 
            })}
            disabled={product.stock === 0}
          >
            Add to Cart
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

### React Hook Form Integration

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { trpc } from '@/infrastructure/api/trpc';
import { z } from 'zod';

const productSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  price: z.number().positive('Price must be positive'),
  stock: z.number().int().min(0, 'Stock cannot be negative'),
  description: z.string().optional(),
});

type ProductForm = z.infer<typeof productSchema>;

function ProductForm() {
  const { register, handleSubmit, formState: { errors }, reset } = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
  });

  const createProduct = trpc.product.create.useMutation({
    onSuccess: () => {
      reset();
    },
  });

  const onSubmit = (data: ProductForm) => {
    createProduct.mutate(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label>Name</label>
        <input {...register('name')} className="border p-2 w-full" />
        {errors.name && <p className="text-red-500">{errors.name.message}</p>}
      </div>

      <div>
        <label>Price</label>
        <input 
          type="number" 
          step="0.01"
          {...register('price', { valueAsNumber: true })} 
          className="border p-2 w-full" 
        />
        {errors.price && <p className="text-red-500">{errors.price.message}</p>}
      </div>

      <div>
        <label>Stock</label>
        <input 
          type="number"
          {...register('stock', { valueAsNumber: true })} 
          className="border p-2 w-full" 
        />
        {errors.stock && <p className="text-red-500">{errors.stock.message}</p>}
      </div>

      <button type="submit" disabled={createProduct.isPending}>
        {createProduct.isPending ? 'Creating...' : 'Create Product'}
      </button>
    </form>
  );
}
```

---

## Mobile Examples

### Using tRPC in React Native

```typescript
import { trpc } from '@/infrastructure/api/trpc';
import { View, Text, Button, FlatList, ActivityIndicator } from 'react-native';

function ProductsScreen() {
  const { data: products, isLoading, refetch } = trpc.product.getAll.useQuery();
  const createProduct = trpc.product.create.useMutation({
    onSuccess: () => refetch(),
  });

  const handleCreate = () => {
    createProduct.mutate({
      name: 'New Product',
      price: 99.99,
      stock: 100,
    });
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Button title="Create Product" onPress={handleCreate} />
      
      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={{ padding: 16, borderBottomWidth: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold' }}>{item.name}</Text>
            <Text style={{ color: 'green', fontSize: 16 }}>${item.price}</Text>
            <Text style={{ color: 'gray' }}>Stock: {item.stock}</Text>
          </View>
        )}
        refreshing={isLoading}
        onRefresh={refetch}
      />
    </View>
  );
}
```

### Authentication Flow

```typescript
import { useState } from 'react';
import { View, TextInput, Button, Alert } from 'react-native';
import { useAuth } from '@/application/hooks/useAuth';

function LoginScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login } = useAuth();

  const handleLogin = async () => {
    try {
      await login(email, password);
      // Navigation handled automatically by AppNavigator
    } catch (error: any) {
      Alert.alert('Login Failed', error.message);
    }
  };

  return (
    <View style={{ padding: 20 }}>
      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        style={{ borderWidth: 1, padding: 10, marginBottom: 10 }}
      />
      
      <TextInput
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        style={{ borderWidth: 1, padding: 10, marginBottom: 10 }}
      />
      
      <Button title="Login" onPress={handleLogin} />
      
      <Button 
        title="Create Account" 
        onPress={() => navigation.navigate('Register')}
      />
    </View>
  );
}
```

### Navigation

```typescript
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '@/application/hooks/useAuth';

const Stack = createNativeStackNavigator();

export function AppNavigator() {
  const { user } = useAuth();

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {!user ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Products" component={ProductsScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

---

## Complete Feature Example

Let's build a complete "Orders" feature from scratch.

### 1. Define Validation Schema

Create `shared/src/schemas/order.schemas.ts`, then add `export * from './order.schemas'` to `shared/src/schemas/index.ts`:

```typescript
// shared/src/schemas/order.schemas.ts
import { z } from 'zod';

export const createOrderSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  notes: z.string().optional(),
});

export const updateOrderStatusSchema = z.object({
  orderId: z.string().uuid(),
  status: z.enum(['pending', 'processing', 'completed', 'cancelled']),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
```

The schema is now importable everywhere via `import { createOrderSchema } from '@shared/schemas'`.

### 2. Add Database Table

```sql
-- backend/database/schema.sql (camelCase for tables/columns)
CREATE TABLE IF NOT EXISTS "order" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "userId" UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    "productId" UUID NOT NULL REFERENCES product(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    "totalPrice" DECIMAL(10, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    notes TEXT,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_orders_user_id ON "order"("userId", "createdAt" DESC);
CREATE INDEX idx_orders_status ON "order"(status);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW."updatedAt" = CURRENT_TIMESTAMP; RETURN NEW; END; $$ language 'plpgsql';
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON "order"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 3. Create Domain Structure

Create `backend/src/domain/order/` folder with these files:

**order.entity.ts** (Core - Entity)
```typescript
export interface Order {
  id: string;
  userId: string;
  productId: string;
  quantity: number;
  totalPrice: number;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

**order.interface.ts** (Core - Repository Interface)
```typescript
import { Order } from './order.entity';

export interface IOrderRepository {
  findByUser(userId: string): Promise<Order[]>;
  create(data: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>): Promise<Order>;
  updateStatus(orderId: string, status: string): Promise<Order | null>;
}
```

**order.repository.ts** (Infrastructure - Implementation)
```typescript
import { query, transaction } from "../../db";
import { IOrderRepository } from './order.interface';
import { Order } from './order.entity';

export class OrderRepository implements IOrderRepository {
  async findByUser(userId: string): Promise<Order[]> {
    return query(
      `SELECT
        o.*,
        p.name as product_name,
        p.price as product_price
       FROM "order" o
       JOIN product p ON o.product_id = p.id
       WHERE o.user_id = :userId
       ORDER BY o.created_at DESC`,
      { userId }
    );
  }

  async create(data: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>): Promise<Order> {
    return transaction(async (client) => {
      const productResult = await client.query(
        `SELECT price, stock FROM product WHERE id = :productId FOR UPDATE`,
        { productId: data.productId }
      );
      const [product] = productResult.rows;

      if (!product) throw new Error('Product not found');
      if (product.stock < data.quantity) throw new Error('Insufficient stock');

      const totalPrice = product.price * data.quantity;

      const orderResult = await client.query(
        `INSERT INTO "order" (user_id, product_id, quantity, total_price, notes)
         VALUES (:userId, :productId, :quantity, :totalPrice, :notes)
         RETURNING *`,
        { ...data, totalPrice }
      );

      await client.query(
        `UPDATE product SET stock = stock - :quantity WHERE id = :productId`,
        { quantity: data.quantity, productId: data.productId }
      );

      return orderResult.rows[0];
    });
  }

  async updateStatus(orderId: string, status: string): Promise<Order | null> {
    const [row] = await query<Order>(
      `UPDATE "order"
       SET status = :status, updated_at = CURRENT_TIMESTAMP
       WHERE id = :orderId
       RETURNING *`,
      { status, orderId }
    );
    return row ?? null;
  }
}
```

**order.service.ts** (Application - Business Logic)
```typescript
import { IOrderRepository } from './order.interface';
import { Order } from './order.entity';
import { NotFoundError } from '../../shared/errors';

export class OrderService {
  constructor(private orderRepository: IOrderRepository) {}

  async getUserOrders(userId: string): Promise<Order[]> {
    return this.orderRepository.findByUser(userId);
  }

  async createOrder(data: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>): Promise<Order> {
    return this.orderRepository.create(data);
  }

  async updateOrderStatus(orderId: string, status: string): Promise<Order> {
    const order = await this.orderRepository.updateStatus(orderId, status);
    if (!order) {
      throw new NotFoundError('Order');
    }
    return order;
  }
}
```

**order.router.ts** (Presentation - tRPC Router)
```typescript
import { router, protectedProcedureWithErrorHandling } from '../../presentation/trpc';
import { createOrderSchema, updateOrderStatusSchema } from '../../shared/schemas';
import { OrderService } from './order.service';
import { OrderRepository } from './order.repository';

const orderRepository = new OrderRepository();
const orderService = new OrderService(orderRepository);

export const orderRouter = router({
  getMyOrders: protectedProcedureWithErrorHandling
    .query(async ({ ctx }) => {
      return orderService.getUserOrders(ctx.user.id);
    }),

  create: protectedProcedureWithErrorHandling
    .input(createOrderSchema)
    .mutation(async ({ input, ctx }) => {
      return orderService.createOrder({
        ...input,
        userId: ctx.user.id,
      });
    }),

  updateStatus: protectedProcedureWithErrorHandling
    .input(updateOrderStatusSchema)
    .mutation(async ({ input }) => {
      return orderService.updateOrderStatus(input.orderId, input.status);
    }),
});

// Add to backend/src/presentation/routers/_app.ts:
// export const appRouter = router({
//   // ...
//   order: orderRouter,
// });
```

### 5. Use in Web Frontend

```typescript
// frontend/src/presentation/pages/OrdersPage.tsx
import { trpc } from '@/infrastructure/api/trpc';
import { Button } from '@/presentation/components/ui/button';
import { Card } from '@/presentation/components/ui/card';

function OrdersPage() {
  const { data: orders, isLoading } = trpc.order.getMyOrders.useQuery();
  const createOrder = trpc.order.create.useMutation();

  const handleCreateOrder = () => {
    createOrder.mutate({
      productId: 'some-product-id',
      quantity: 2,
      notes: 'Please deliver quickly',
    });
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">My Orders</h1>
        <Button onClick={handleCreateOrder}>
          Create Order
        </Button>
      </div>

      {isLoading ? (
        <div>Loading...</div>
      ) : (
        <div className="grid gap-4">
          {orders?.map(order => (
            <Card key={order.id} className="p-4">
              <div className="flex justify-between">
                <div>
                  <h3 className="font-bold">{order.product_name}</h3>
                  <p>Quantity: {order.quantity}</p>
                  <p>Total: ${order.total_price}</p>
                </div>
                <div>
                  <span className={`px-3 py-1 rounded ${
                    order.status === 'completed' ? 'bg-green-100' : 'bg-yellow-100'
                  }`}>
                    {order.status}
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

### 6. Use in Mobile

```typescript
// mobile/src/presentation/screens/OrdersScreen.tsx
import { trpc } from '@/infrastructure/api/trpc';
import { View, Text, FlatList, Button, StyleSheet } from 'react-native';

function OrdersScreen() {
  const { data: orders, isLoading } = trpc.order.getMyOrders.useQuery();
  const createOrder = trpc.order.create.useMutation();

  const handleCreateOrder = () => {
    createOrder.mutate({
      productId: 'some-product-id',
      quantity: 2,
      notes: 'Please deliver quickly',
    });
  };

  return (
    <View style={styles.container}>
      <Button title="Create Order" onPress={handleCreateOrder} />

      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.orderCard}>
            <Text style={styles.productName}>{item.product_name}</Text>
            <Text>Quantity: {item.quantity}</Text>
            <Text>Total: ${item.total_price}</Text>
            <Text style={[
              styles.status,
              item.status === 'completed' && styles.statusCompleted
            ]}>
              {item.status}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  orderCard: { 
    padding: 16, 
    backgroundColor: 'white', 
    marginBottom: 12, 
    borderRadius: 8 
  },
  productName: { fontSize: 18, fontWeight: 'bold' },
  status: { 
    marginTop: 8, 
    paddingHorizontal: 12, 
    paddingVertical: 4,
    backgroundColor: '#FEF3C7',
    alignSelf: 'flex-start',
    borderRadius: 4,
  },
  statusCompleted: { backgroundColor: '#D1FAE5' },
});
```

### 7. Run Database Migration

```bash
cd backend
npm run db:reset  # Recreate database with new orders table
npm run db:seed   # Add sample data
```

---

## Additional Tips

### Checking Optional Services

```typescript
import { isServiceEnabled } from './infrastructure/config/optional-services';

if (isServiceEnabled('s3')) {
  // Use S3 service
  const s3Service = new S3Service();
  await s3Service.upload(file);
} else {
  // Fallback: save to local filesystem
  await fs.writeFile(`uploads/${filename}`, file);
}
```

### Error Handling

```typescript
import { TRPCError } from '@trpc/server';

try {
  const [user] = await query(`SELECT * FROM "user" WHERE id = :id`, { id });
  if (!user) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'User not found',
    });
  }
  return user;
} catch (error) {
  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Failed to fetch user',
    cause: error,
  });
}
```

---

**Need more examples?** Check the source code in:
- `backend/src/domain/` - Domain examples (router, service, repository per domain)
- `frontend/src/presentation/pages/` - Frontend examples  
- `mobile/src/presentation/screens/` - Mobile examples
