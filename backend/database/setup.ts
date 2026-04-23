import "dotenv/config";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

// Extract database name from DATABASE_URL
function getDatabaseName(url: string): string {
  const match = url.match(/\/([^\/\?]+)(\?|$)/);
  if (!match) {
    throw new Error("Invalid DATABASE_URL format. Expected: postgresql://user:password@host:port/dbname");
  }
  return match[1];
}

async function createDatabaseIfNotExists() {
  const databaseUrl = process.env.DATABASE_URL;
  const adminUrl = process.env.DATABASE_ADMIN_URL;
  
  if (!databaseUrl) {
    throw new Error("DATABASE_URL not found in environment variables");
  }
  
  if (!adminUrl) {
    throw new Error("DATABASE_ADMIN_URL not found. Add it to .env: postgresql://user:password@host:port/postgres");
  }

  const dbName = getDatabaseName(databaseUrl);
  
  // Connect using admin connection (usually to 'postgres' database)
  const adminClient = new Client({ connectionString: adminUrl });

  try {
    await adminClient.connect();
    console.log(`🔍 Checking if database "${dbName}" exists...`);

    // Check if database exists
    const result = await adminClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName]
    );

    if (result.rows.length === 0) {
      // Database doesn't exist, create it
      console.log(`📦 Database "${dbName}" not found. Creating...`);
      await adminClient.query(`CREATE DATABASE "${dbName}"`);
      console.log(`✅ Database "${dbName}" created successfully!\n`);
    } else {
      console.log(`✅ Database "${dbName}" already exists\n`);
    }
  } catch (error: any) {
    if (error.code === '42P04') {
      // Database already exists (race condition)
      console.log(`✅ Database "${dbName}" already exists\n`);
    } else {
      throw error;
    }
  } finally {
    await adminClient.end();
  }
}

async function setupTables() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL not found in environment variables");
  }

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    console.log("🔧 Setting up database tables...\n");

    // Read and execute schema
    const schemaSQL = readFileSync(join(__dirname, "schema.sql"), "utf-8");
    console.log("Creating tables and indexes...");
    await client.query(schemaSQL);
    console.log("✅ Tables created successfully\n");

    console.log("✅ Database setup complete!");
    console.log("\nNext steps:");
    console.log("  1. Run 'npm run db:seed' to add default data");
    console.log("  2. Run 'npm run dev' to start the server");
  } catch (error) {
    console.error("❌ Setup failed:", error);
    throw error;
  } finally {
    await client.end();
  }
}

async function main() {
  try {
    console.log("🚀 Starting database setup...\n");
    
    // Step 1: Create database if it doesn't exist (using admin connection)
    await createDatabaseIfNotExists();
    
    // Step 2: Create tables (using target database connection)
    await setupTables();
    
    process.exit(0);
  } catch (error: any) {
    console.error("\n❌ Setup failed:", error.message);
    console.error("\nTroubleshooting:");
    console.error("1. Make sure PostgreSQL is running");
    console.error("2. Check your .env file has both:");
    console.error("   DATABASE_URL=\"postgresql://user:pass@host:5432/your_db\"");
    console.error("   DATABASE_ADMIN_URL=\"postgresql://user:pass@host:5432/postgres\"");
    console.error("3. Ensure the PostgreSQL user has permission to create databases\n");
    process.exit(1);
  }
}

main();
