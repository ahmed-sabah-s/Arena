import "dotenv/config";
import pg from "pg";

const { Pool, Client } = pg;

// Custom Client with named parameters support
// Use :paramName in queries instead of $1, $2, $3
class CustomClient extends Client {
  constructor(...args: any[]) {
    super(...args);
  }

  async query<T = any>(
    query: string,
    params?: Record<string, any> | any[]
  ): Promise<pg.QueryResult<T>> {
    // If no params or array params, use default behavior
    if (params === undefined || params instanceof Array) {
      return await super.query(query, params);
    }

    // Convert named parameters to positional
    const m = new Map();
    const convertedQuery = query.replace(
      /(?<!:):([a-zA-Z0-9_]+)/g,
      (_, key) => {
        if (params[key] === undefined) {
          throw new Error(`Missing parameter: ${key}`);
        }
        m.set(key, m.get(key) ?? m.size + 1);
        return `$${m.get(key)}`;
      }
    );

    const values = [...m.keys()].map((key) => params[key]);
    return await super.query(convertedQuery, values);
  }
}

// PostgreSQL connection pool with named parameters support
class CustomPool extends Pool {
  async query<T = any>(
    query: string,
    params?: Record<string, any> | any[]
  ): Promise<pg.QueryResult<T>> {
    // If no params or array params, use default behavior
    if (params === undefined || params instanceof Array) {
      return await super.query(query, params);
    }

    // Convert named parameters to positional
    const m = new Map();
    const convertedQuery = query.replace(
      /(?<!:):([a-zA-Z0-9_]+)/g,
      (_, key) => {
        if (params[key] === undefined) {
          throw new Error(`Missing parameter: ${key}`);
        }
        m.set(key, m.get(key) ?? m.size + 1);
        return `$${m.get(key)}`;
      }
    );

    const values = [...m.keys()].map((key) => params[key]);
    return await super.query(convertedQuery, values);
  }
}

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

// Helper function for queries (supports both positional and named params)
export const query = async <T = any>(
  text: string,
  params?: Record<string, any> | any[]
): Promise<T[]> => {
  const start = Date.now();
  const res = await pool.query<T>(text, params);
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
