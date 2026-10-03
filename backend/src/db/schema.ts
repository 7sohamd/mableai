import Database from 'better-sqlite3';

/**
 * Supported event type values as a SQL-safe tuple for CHECK constraints.
 * Must be kept in sync with EventTypeEnum in contracts/audiencePreview.ts.
 */
const SUPPORTED_EVENT_TYPES = [
  'page_view',
  'product_view',
  'add_to_cart',
  'checkout_started',
  'purchase',
] as const;

const EVENT_TYPE_CHECK = SUPPORTED_EVENT_TYPES.map((t) => `'${t}'`).join(', ');

/**
 * Initializes the database schema: creates tables and indexes if they do not
 * already exist. Safe to call multiple times (fully idempotent via IF NOT EXISTS).
 *
 * Schema:
 *
 *   anonymous_users
 *     id            INTEGER PRIMARY KEY
 *     anonymous_id  TEXT UNIQUE NOT NULL
 *
 *   events
 *     id                 INTEGER PRIMARY KEY
 *     anonymous_user_id  INTEGER NOT NULL REFERENCES anonymous_users(id)
 *     event_type         TEXT NOT NULL  (CHECK in supported set)
 *     occurred_at        TEXT NOT NULL  (ISO 8601 UTC, e.g. "2026-09-29T00:00:00.000Z")
 *
 * Indexes:
 *   - events(anonymous_user_id)        — fast per-user lookups
 *   - events(event_type)               — fast per-type aggregation
 *   - events(occurred_at)              — range scans on time window
 *   - events(anonymous_user_id, event_type, occurred_at) — composite covering index
 *     used by the repository query that filters by user + type + window simultaneously.
 */
export function initializeSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS anonymous_users (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      anonymous_id TEXT    NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS events (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      anonymous_user_id INTEGER NOT NULL
                          REFERENCES anonymous_users(id)
                          ON DELETE CASCADE,
      event_type        TEXT    NOT NULL
                          CHECK(event_type IN (${EVENT_TYPE_CHECK})),
      occurred_at       TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_events_user_id
      ON events(anonymous_user_id);

    CREATE INDEX IF NOT EXISTS idx_events_event_type
      ON events(event_type);

    CREATE INDEX IF NOT EXISTS idx_events_occurred_at
      ON events(occurred_at);

    CREATE INDEX IF NOT EXISTS idx_events_user_type_time
      ON events(anonymous_user_id, event_type, occurred_at);
  `);
}
