/**
 * Database initialization and seeding script.
 *
 * Usage:
 *   npx tsx src/scripts/initDb.ts [--seed]
 *
 * Options:
 *   --seed   Also run the deterministic fixture seed after schema init.
 *            Without this flag only schema initialization is performed.
 *
 * Examples:
 *   npx tsx src/scripts/initDb.ts          # schema only
 *   npx tsx src/scripts/initDb.ts --seed   # schema + seed
 *
 * The script is safe to run multiple times. Re-running with --seed preserves
 * the intended fixture dataset without creating duplicate rows.
 */

import path from 'path';
import dotenv from 'dotenv';

// Load environment configuration before importing modules that read config.
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { config } from '../config/env';
import { getDb, closeDb } from '../db/connection';
import { initializeSchema } from '../db/schema';
import { seedDatabase, SEED_USER_COUNT, SEED_TOTAL_EVENTS } from '../db/seed';

const shouldSeed = process.argv.includes('--seed');

console.log('[initDb] Starting database initialization...');
console.log(`[initDb] Database path: ${config.databasePath}`);

let exitCode = 0;

try {
  const db = getDb(config.databasePath);

  // ── Schema ────────────────────────────────────────────────────────────────
  initializeSchema(db);
  console.log('[initDb] Schema initialized (tables and indexes created if not present).');

  // ── Seed ─────────────────────────────────────────────────────────────────
  if (shouldSeed) {
    seedDatabase(db);
    console.log(
      `[initDb] Seed complete. ${SEED_USER_COUNT} fixture users, ${SEED_TOTAL_EVENTS} events inserted/refreshed.`
    );

    // Verify by querying counts.
    const userCount = (db.prepare('SELECT COUNT(*) AS n FROM anonymous_users').get() as { n: number }).n;
    const eventCount = (db.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number }).n;
    console.log(`[initDb] Verification — users: ${userCount}, events: ${eventCount}`);
  }

  console.log('[initDb] Done.');
} catch (err) {
  console.error('[initDb] Error:', (err as Error).message);
  exitCode = 1;
} finally {
  closeDb();
}

process.exit(exitCode);
