import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, transaction } from '../src/db';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, 'migrations');

interface Migration {
  id: string;
  appliedAt: string;
}

async function createMigrationsTable() {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS "schemaMigrations" (
      id VARCHAR(100) PRIMARY KEY,
      "appliedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `;
  await pool.query(createTableQuery);
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const result = await pool.query<Migration>(
    'SELECT id FROM "schemaMigrations" ORDER BY id'
  );
  return new Set(result.rows.map((row) => row.id));
}

async function getMigrationFiles(): Promise<string[]> {
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
  return files.sort();
}

async function applyMigration(
  filename: string,
  filePath: string,
  dryRun: boolean = false
): Promise<number> {
  const sql = fs.readFileSync(filePath, 'utf-8');
  const startTime = Date.now();

  if (dryRun) {
    console.log(`  [DRY RUN] ${filename}`);
    return 0;
  }

  await transaction(async (client) => {
    await client.query(sql);
    await client.query('INSERT INTO "schemaMigrations" (id) VALUES (:id)', {
      id: filename,
    });
  });

  const duration = Date.now() - startTime;
  console.log(`  ✓ ${filename} (${duration}ms)`);
  return duration;
}

async function migrate() {
  const dryRun = process.argv.includes('--dry-run');

  if (dryRun) {
    console.log('Running migrations in DRY RUN mode...\n');
  } else {
    console.log('Running migrations...\n');
  }

  try {
    // Create migrations table if it doesn't exist
    await createMigrationsTable();

    // Get applied migrations
    const applied = await getAppliedMigrations();

    // Get all migration files
    const migrationFiles = await getMigrationFiles();

    // Find pending migrations
    const pending = migrationFiles.filter((f) => !applied.has(f));

    if (pending.length === 0) {
      console.log('No pending migrations.');
      return;
    }

    console.log(`Found ${pending.length} pending migration(s):\n`);

    // Apply pending migrations
    for (const filename of pending) {
      const filePath = path.join(migrationsDir, filename);
      await applyMigration(filename, filePath, dryRun);
    }

    if (!dryRun) {
      console.log(`\n✓ Applied ${pending.length} migration(s)`);
    }
  } catch (error) {
    console.error('\n✗ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
