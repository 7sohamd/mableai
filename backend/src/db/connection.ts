import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

/**
 * Holds the single active Database instance for the process lifetime.
 * Initialized lazily on first call to getDb().
 */
let _db: Database.Database | null = null;

/**
 * Returns the process-level SQLite database connection.
 *
 * The connection is opened lazily the first time this function is called.
 * Subsequent calls return the same instance.
 *
 * @param databasePath - Absolute or relative path to the SQLite file.
 *   Relative paths are resolved from process.cwd().
 *   Defaults to `./data/mable.db`.
 */
export function getDb(databasePath: string = './data/mable.db'): Database.Database {
  if (_db) {
    return _db;
  }

  const resolvedPath = path.isAbsolute(databasePath)
    ? databasePath
    : path.resolve(process.cwd(), databasePath);

  // Ensure the parent directory exists before opening the file.
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  try {
    _db = new Database(resolvedPath);
    // Enable foreign-key enforcement for every connection.
    _db.pragma('foreign_keys = ON');
    // WAL mode for better concurrent read performance.
    _db.pragma('journal_mode = WAL');
    return _db;
  } catch (err) {
    throw new Error(
      `Failed to open SQLite database at "${resolvedPath}": ${(err as Error).message}`
    );
  }
}

/**
 * Creates and returns a fresh, isolated in-memory Database instance.
 * Intended for use in tests so test runs never touch the dev/prod database file.
 */
export function createInMemoryDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  return db;
}

/**
 * Closes the shared database connection and resets the module-level singleton.
 * Safe to call multiple times (no-op if already closed).
 * Should be called during graceful application shutdown.
 */
export function closeDb(): void {
  if (_db) {
    try {
      _db.close();
    } finally {
      _db = null;
    }
  }
}

/**
 * Resets the singleton reference without closing the underlying connection.
 * Intended for test teardown when each test creates its own isolated instance.
 */
export function resetDbSingleton(): void {
  _db = null;
}
