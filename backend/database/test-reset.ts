import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;

function getDatabaseName(url: string): string {
  const match = url.match(/\/([^\/\?]+)(\?|$)/);
  if (!match) throw new Error('Invalid TEST_DATABASE_URL format');
  return match[1];
}

async function resetTestDatabase(): Promise<void> {
  const testUrl = process.env.TEST_DATABASE_URL;
  const adminUrl = process.env.DATABASE_ADMIN_URL;

  if (!testUrl || !adminUrl) {
    throw new Error('TEST_DATABASE_URL and DATABASE_ADMIN_URL required in .env');
  }
  if (testUrl === process.env.DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL must not equal DATABASE_URL');
  }

  const dbName = getDatabaseName(testUrl);
  const client = new Client({ connectionString: adminUrl });

  try {
    await client.connect();
    console.log(`🗑️  Dropping test database "${dbName}"...`);

    await client.query(
      `SELECT pg_terminate_backend(pg_stat_activity.pid)
       FROM pg_stat_activity
       WHERE pg_stat_activity.datname = $1 AND pid <> pg_backend_pid()`,
      [dbName],
    );

    await client.query(`DROP DATABASE IF EXISTS "${dbName}"`);
    console.log(`✅ Test database dropped`);

    await client.query(`CREATE DATABASE "${dbName}"`);
    console.log(`✅ Test database recreated\n`);
  } finally {
    await client.end();
  }
}

resetTestDatabase()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Test reset failed:', err.message);
    process.exit(1);
  });
