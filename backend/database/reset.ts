import "dotenv/config";
import pg from "pg";

const { Client } = pg;

function getDatabaseName(url: string): string {
  const match = url.match(/\/([^\/\?]+)(\?|$)/);
  if (!match) throw new Error("Invalid DATABASE_URL format");
  return match[1];
}

async function resetDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  const adminUrl = process.env.DATABASE_ADMIN_URL;
  
  if (!databaseUrl || !adminUrl) {
    throw new Error("DATABASE_URL and DATABASE_ADMIN_URL required in .env");
  }

  const dbName = getDatabaseName(databaseUrl);
  const client = new Client({ connectionString: adminUrl });

  try {
    await client.connect();
    console.log(`🗑️  Dropping database "${dbName}"...`);
    
    // Terminate existing connections
    await client.query(`
      SELECT pg_terminate_backend(pg_stat_activity.pid)
      FROM pg_stat_activity
      WHERE pg_stat_activity.datname = $1
      AND pid <> pg_backend_pid()
    `, [dbName]);
    
    // Drop database
    await client.query(`DROP DATABASE IF EXISTS "${dbName}"`);
    console.log(`✅ Database dropped\n`);
    
  } finally {
    await client.end();
  }
}

resetDatabase()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Reset failed:", err.message);
    process.exit(1);
  });
