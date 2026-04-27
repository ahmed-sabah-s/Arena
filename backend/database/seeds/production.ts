import type { CustomClient } from '../../src/db.js';

/**
 * Production seed: absolute minimum.
 * No users. The production admin is created via the ADMIN_BOOTSTRAP_TOKEN environment
 * variable through the bootstrap flow (Phase 8).
 *
 * This seed intentionally inserts nothing — production data is real and must never be
 * overwritten by automated seeds.
 */
export default async function seedProduction(_client: CustomClient): Promise<void> {
  console.log('  Production seed: no data to insert (admin created via ADMIN_BOOTSTRAP_TOKEN).');
}
