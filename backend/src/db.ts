import "dotenv/config";
import pg from "pg";

const { Pool, Client } = pg;

// Named-parameter conversion helper — shared between CustomClient and CustomPool.
// Replaces :paramName with $1, $2, ... and returns the converted query + positional values.
// Param values are opaque to us — pg consumes them unchanged — so unknown is correct.
function convertNamedParams(
  query: string,
  params: Record<string, unknown>
): { convertedQuery: string; values: unknown[] } {
  const m = new Map<string, number>();
  const convertedQuery = query.replace(
    /(?<!:):([a-zA-Z0-9_]+)/g,
    (_, key: string) => {
      if (params[key] === undefined) {
        throw new Error(`Missing parameter: ${key}`);
      }
      m.set(key, m.get(key) ?? m.size + 1);
      return `$${m.get(key)}`;
    }
  );
  const values = [...m.keys()].map((key) => params[key]);
  return { convertedQuery, values };
}

// Custom Client with named parameters support
// Use :paramName in queries instead of $1, $2, $3
class CustomClient extends Client {
  // Forwarding constructor to pg.Client (which has many overloads). Typing this against
  // ConstructorParameters<typeof Client> works in some TS versions but is fragile across
  // pg type-defs revisions; the any[] forwarding is the well-trodden pattern.
  constructor(...args: any[]) {
    super(...args);
  }

  // Declare all overloads from pg.Client.query() so the override is structurally compatible.
  // The implementation adds named-parameter support on top of the standard behaviour.
  // Generic defaults use `any` (rather than `unknown`) intentionally: this is the public API
  // that consumers call as `client.query<MyRow>(...)` — `any` keeps the no-generic call site
  // ergonomic while typed call sites still get full safety. Same pattern in pg's own types.
  query<T extends pg.Submittable>(queryStream: T): T;
  query<R extends any[] = any[], I = any[]>(queryConfig: pg.QueryArrayConfig<I>, values?: pg.QueryConfigValues<I>): Promise<pg.QueryResult<R>>;
  query<R extends pg.QueryResultRow = any, I = any>(queryConfig: pg.QueryConfig<I>): Promise<pg.QueryResult<R>>;
  query<R extends pg.QueryResultRow = any, I extends any[] = any[]>(queryTextOrConfig: string | pg.QueryConfig<I>, values?: pg.QueryConfigValues<I>): Promise<pg.QueryResult<R>>;
  query<R extends pg.QueryResultRow = any>(queryText: string, namedParams: Record<string, unknown>): Promise<pg.QueryResult<R>>;
  // Implementation signature must accept the union of all overloads — TypeScript's
  // standard pattern uses `any` here. The overload signatures above are typed.
  query(queryTextOrConfig: any, params?: any): any {
    // Named params only apply when first arg is a plain string and params is a plain object
    if (
      typeof queryTextOrConfig === "string" &&
      params !== undefined &&
      !(params instanceof Array)
    ) {
      const { convertedQuery, values } = convertNamedParams(queryTextOrConfig, params);
      // Cast needed: super.query(string, values[]) resolves to a union of overloads at the
      // implementation level; we know it returns QueryResult at runtime.
      return super.query(convertedQuery, values) as unknown as Promise<pg.QueryResult<any>>;
    }
    return super.query(queryTextOrConfig, params);
  }
}

// PostgreSQL connection pool with named parameters support
class CustomPool extends Pool {
  // Same overload strategy as CustomClient — pg.Pool.query() has the same overload set.
  // See CustomClient.query above for why the generic defaults use `any` and the
  // implementation signature uses `any` for the params union.
  query<T extends pg.Submittable>(queryStream: T): T;
  query<R extends any[] = any[], I = any[]>(queryConfig: pg.QueryArrayConfig<I>, values?: pg.QueryConfigValues<I>): Promise<pg.QueryResult<R>>;
  query<R extends pg.QueryResultRow = any, I = any>(queryConfig: pg.QueryConfig<I>): Promise<pg.QueryResult<R>>;
  query<R extends pg.QueryResultRow = any, I extends any[] = any[]>(queryTextOrConfig: string | pg.QueryConfig<I>, values?: pg.QueryConfigValues<I>): Promise<pg.QueryResult<R>>;
  query<R extends pg.QueryResultRow = any>(queryText: string, namedParams: Record<string, unknown>): Promise<pg.QueryResult<R>>;
  query(queryTextOrConfig: any, params?: any): any {
    if (
      typeof queryTextOrConfig === "string" &&
      params !== undefined &&
      !(params instanceof Array)
    ) {
      const { convertedQuery, values } = convertNamedParams(queryTextOrConfig, params);
      return super.query(convertedQuery, values) as unknown as Promise<pg.QueryResult<any>>;
    }
    return super.query(queryTextOrConfig, params);
  }
}

// Export the CustomClient type so seed files and other callers can type the transaction callback.
export type { CustomClient };

// Export pool with named parameters support
export const pool = new CustomPool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Error handler
pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
  process.exit(-1);
});

// Helper function for queries (supports both positional and named params).
// Generic default `T = any` matches pg's own pattern for ergonomic no-generic call sites.
export const query = async <T extends pg.QueryResultRow = any>(
  text: string,
  params?: Record<string, unknown> | unknown[]
): Promise<T[]> => {
  const start = Date.now();
  // Dispatch to the right overload at runtime. TypeScript can't unify "array OR object"
  // params into a single overload call site, so we branch and let the typed overloads resolve.
  const res = Array.isArray(params)
    ? await pool.query<T>(text, params)
    : await pool.query<T>(text, params ?? {});
  const duration = Date.now() - start;

  if (process.env.NODE_ENV === "development") {
    console.log("Executed query", { text, duration, rows: res.rowCount });
  }

  return res.rows;
};

// Helper for transaction
export const transaction = async <T>(
  callback: (client: CustomClient) => Promise<T>
): Promise<T> => {
  const client = new CustomClient({
    connectionString: process.env.DATABASE_URL,
  });

  let connected = false;
  try {
    await client.connect();
    connected = true;
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    // Only attempt ROLLBACK if we successfully connected; otherwise the original
    // connect() error would be swallowed by a secondary query error.
    if (connected) {
      await client.query("ROLLBACK").catch(() => {});
    }
    throw e;
  } finally {
    if (connected) {
      await client.end().catch(() => {});
    }
  }
};

// Graceful shutdown
export const closePool = async () => {
  await pool.end();
  console.log("Database pool closed");
};
