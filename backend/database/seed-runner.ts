import "dotenv/config";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { pool, closePool } from "../src/db";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function seed() {
  try {
    console.log("🌱 Seeding database...\n");

    // Read and execute seed
    const seedSQL = readFileSync(join(__dirname, "seed.sql"), "utf-8");
    await pool.query(seedSQL);

    console.log("✅ Database seeded successfully!");
    console.log("\nDefault users created:");
    console.log("  Admin: admin@example.com / Admin123!");
    console.log("  User:  user@example.com  / Test123!");
  } catch (error) {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

seed();
