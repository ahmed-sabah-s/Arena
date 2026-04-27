import type { CustomClient } from '../../src/db.js';

/**
 * Staging seed: minimal QA baseline.
 * No fake users. Admin is created via the bootstrap token flow defined in .env.
 *
 * Phase 2+: add a QA test user created via STAGING_QA_PHONE env var.
 * Phase 8+: add a staging admin account.
 */
export default async function seedStaging(_client: CustomClient): Promise<void> {
  console.log('  Staging seed: no data to insert (admin created via bootstrap token).');
}
