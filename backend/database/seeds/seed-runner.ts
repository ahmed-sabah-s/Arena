import "dotenv/config";
import { transaction, closePool } from '../../src/db.js';
import type { CustomClient } from '../../src/db.js';

type SeedFn = (client: CustomClient) => Promise<void>;

async function run() {
  const env = process.env.ENVIRONMENT_NAME ?? 'dev';

  if (!process.env.ENVIRONMENT_NAME) {
    console.warn('⚠️  ENVIRONMENT_NAME not set — defaulting to "dev"');
  }

  console.log(`🌱 Seeding database (environment: ${env})...\n`);

  let seedModule: { default: SeedFn };

  try {
    // Dynamic import dispatches to the correct seed file per environment.
    // Paths are relative to this file after tsx/ts resolution.
    if (env === 'production') {
      seedModule = await import('./production.js');
    } else if (env === 'staging') {
      seedModule = await import('./staging.js');
    } else {
      if (env !== 'dev') {
        console.warn(`⚠️  Unknown ENVIRONMENT_NAME "${env}" — falling back to dev seed`);
      }
      seedModule = await import('./dev.js');
    }
  } catch (err) {
    console.error(`❌ Failed to load seed file for environment "${env}":`, err);
    process.exit(1);
  }

  try {
    await transaction(async (client) => {
      await seedModule.default(client);
    });
    console.log('\n✅ Database seeded successfully!');
  } catch (err) {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  } finally {
    await closePool();
  }
}

run();
