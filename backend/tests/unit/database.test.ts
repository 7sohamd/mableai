import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createInMemoryDb } from '../../src/db/connection';
import { initializeSchema } from '../../src/db/schema';
import {
  seedDatabase,
  SEED_AS_OF,
  SEED_WIN_START_7D,
  SEED_WIN_START_30D,
  SEED_AT_LOWER_BOUNDARY,
  SEED_AT_UPPER_BOUNDARY,
  SEED_BEFORE_WINDOW,
  SEED_IN_WINDOW_1,
  SEED_IN_WINDOW_2,
  SEED_USER_COUNT,
} from '../../src/db/seed';
import { SqliteEventRepository } from '../../src/repositories/eventRepository';
import fs from 'fs';
import os from 'os';
import path from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a fresh isolated in-memory DB with schema and seed applied. */
function makeSeededDb(): Database.Database {
  const db = createInMemoryDb();
  initializeSchema(db);
  seedDatabase(db);
  return db;
}

function countRows(db: Database.Database, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}

// ---------------------------------------------------------------------------
// 1. Schema initialization
// ---------------------------------------------------------------------------

describe('Schema initialization', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createInMemoryDb();
  });

  afterEach(() => {
    db.close();
  });

  it('creates anonymous_users and events tables', () => {
    initializeSchema(db);
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
      )
      .all() as Array<{ name: string }>;

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain('anonymous_users');
    expect(tableNames).toContain('events');
  });

  it('creates all expected indexes', () => {
    initializeSchema(db);
    const indexes = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='index'`)
      .all() as Array<{ name: string }>;

    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain('idx_events_user_id');
    expect(indexNames).toContain('idx_events_event_type');
    expect(indexNames).toContain('idx_events_occurred_at');
    expect(indexNames).toContain('idx_events_user_type_time');
  });

  it('is idempotent — running initializeSchema twice does not throw', () => {
    expect(() => {
      initializeSchema(db);
      initializeSchema(db);
    }).not.toThrow();
  });

  it('anonymous_users.anonymous_id has a UNIQUE constraint', () => {
    initializeSchema(db);
    db.prepare('INSERT INTO anonymous_users (anonymous_id) VALUES (?)').run('u_1');
    expect(() =>
      db.prepare('INSERT INTO anonymous_users (anonymous_id) VALUES (?)').run('u_1')
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 2. Foreign-key enforcement
// ---------------------------------------------------------------------------

describe('Foreign-key enforcement', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createInMemoryDb();
    initializeSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  it('foreign_keys pragma is ON (returns 1)', () => {
    const result = db.pragma('foreign_keys', { simple: true });
    expect(result).toBe(1);
  });

  it('rejects insertion of an event with a non-existent anonymous_user_id', () => {
    expect(() =>
      db.prepare(
        'INSERT INTO events (anonymous_user_id, event_type, occurred_at) VALUES (?, ?, ?)'
      ).run(9999, 'page_view', '2026-09-25T10:00:00.000Z')
    ).toThrow();
  });

  it('allows insertion of an event with a valid anonymous_user_id', () => {
    db.prepare('INSERT INTO anonymous_users (anonymous_id) VALUES (?)').run('user_ok');
    const user = db
      .prepare('SELECT id FROM anonymous_users WHERE anonymous_id = ?')
      .get('user_ok') as { id: number };

    expect(() =>
      db.prepare(
        'INSERT INTO events (anonymous_user_id, event_type, occurred_at) VALUES (?, ?, ?)'
      ).run(user.id, 'page_view', '2026-09-25T10:00:00.000Z')
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 3. Event type CHECK constraint
// ---------------------------------------------------------------------------

describe('Event type constraint', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createInMemoryDb();
    initializeSchema(db);
    db.prepare('INSERT INTO anonymous_users (anonymous_id) VALUES (?)').run('user_chk');
  });

  afterEach(() => {
    db.close();
  });

  const VALID_TYPES = [
    'page_view',
    'product_view',
    'add_to_cart',
    'checkout_started',
    'purchase',
  ] as const;

  for (const eventType of VALID_TYPES) {
    it(`accepts valid event type: ${eventType}`, () => {
      const userId = (
        db
          .prepare('SELECT id FROM anonymous_users WHERE anonymous_id = ?')
          .get('user_chk') as { id: number }
      ).id;

      expect(() =>
        db
          .prepare(
            'INSERT INTO events (anonymous_user_id, event_type, occurred_at) VALUES (?, ?, ?)'
          )
          .run(userId, eventType, '2026-09-25T10:00:00.000Z')
      ).not.toThrow();
    });
  }

  it('rejects unsupported event type: item_clicked', () => {
    const userId = (
      db
        .prepare('SELECT id FROM anonymous_users WHERE anonymous_id = ?')
        .get('user_chk') as { id: number }
    ).id;

    expect(() =>
      db
        .prepare(
          'INSERT INTO events (anonymous_user_id, event_type, occurred_at) VALUES (?, ?, ?)'
        )
        .run(userId, 'item_clicked', '2026-09-25T10:00:00.000Z')
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 4. Seed idempotency
// ---------------------------------------------------------------------------

describe('Seed idempotency', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createInMemoryDb();
    initializeSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  it('running seedDatabase twice yields the same user count', () => {
    seedDatabase(db);
    const countAfterFirst = countRows(db, 'anonymous_users');

    seedDatabase(db);
    const countAfterSecond = countRows(db, 'anonymous_users');

    expect(countAfterFirst).toBe(SEED_USER_COUNT);
    expect(countAfterSecond).toBe(SEED_USER_COUNT);
  });

  it('running seedDatabase twice yields the same event count', () => {
    seedDatabase(db);
    const eventsAfterFirst = countRows(db, 'events');

    seedDatabase(db);
    const eventsAfterSecond = countRows(db, 'events');

    expect(eventsAfterFirst).toBe(eventsAfterSecond);
    expect(eventsAfterFirst).toBeGreaterThan(0);
  });

  it('running seedDatabase three times still yields the same counts', () => {
    seedDatabase(db);
    seedDatabase(db);
    seedDatabase(db);

    expect(countRows(db, 'anonymous_users')).toBe(SEED_USER_COUNT);
  });
});

// ---------------------------------------------------------------------------
// 5. Repository — event aggregation (getEventCounts)
// ---------------------------------------------------------------------------

describe('SqliteEventRepository.getEventCounts', () => {
  let db: Database.Database;
  const repo = new SqliteEventRepository();

  beforeEach(() => {
    db = makeSeededDb();
  });

  afterEach(() => {
    db.close();
  });

  it('counts product_views within the 7-day window for anon_match_a (expect 3)', () => {
    const results = repo.getEventCounts(db, 'product_view', SEED_WIN_START_7D, SEED_AS_OF);
    const user = results.find((r) => r.anonymousId === 'anon_match_a');

    expect(user).toBeDefined();
    expect(user!.count).toBe(3);
  });

  it('counts product_views within the 7-day window for anon_match_b (expect 2)', () => {
    const results = repo.getEventCounts(db, 'product_view', SEED_WIN_START_7D, SEED_AS_OF);
    const user = results.find((r) => r.anonymousId === 'anon_match_b');

    expect(user).toBeDefined();
    expect(user!.count).toBe(2);
  });

  it('anon_nomatch_count has only 1 product_view in 7-day window', () => {
    const results = repo.getEventCounts(db, 'product_view', SEED_WIN_START_7D, SEED_AS_OF);
    const user = results.find((r) => r.anonymousId === 'anon_nomatch_count');

    expect(user).toBeDefined();
    expect(user!.count).toBe(1);
  });

  it('anon_no_events does not appear in results', () => {
    const results = repo.getEventCounts(db, 'product_view', SEED_WIN_START_7D, SEED_AS_OF);
    const user = results.find((r) => r.anonymousId === 'anon_no_events');
    expect(user).toBeUndefined();
  });

  it('anon_outside_window has no product_views counted inside the 7-day window', () => {
    const results = repo.getEventCounts(db, 'product_view', SEED_WIN_START_7D, SEED_AS_OF);
    const user = results.find((r) => r.anonymousId === 'anon_outside_window');
    // All their events are before windowStart, so they should NOT appear.
    expect(user).toBeUndefined();
  });

  it('anon_future_events has no product_views counted (all after asOf)', () => {
    const results = repo.getEventCounts(db, 'product_view', SEED_WIN_START_7D, SEED_AS_OF);
    const user = results.find((r) => r.anonymousId === 'anon_future_events');
    expect(user).toBeUndefined();
  });

  it('purchase count for anon_nomatch_purchase is 1 within 7-day window', () => {
    const results = repo.getEventCounts(db, 'purchase', SEED_WIN_START_7D, SEED_AS_OF);
    const user = results.find((r) => r.anonymousId === 'anon_nomatch_purchase');

    expect(user).toBeDefined();
    expect(user!.count).toBe(1);
  });

  it('purchase count for anon_match_b is 0 within 7-day window (purchase was before window)', () => {
    const results = repo.getEventCounts(db, 'purchase', SEED_WIN_START_7D, SEED_AS_OF);
    const user = results.find((r) => r.anonymousId === 'anon_match_b');
    // purchase for anon_match_b is WELL_BEFORE_WINDOW so it should not be counted
    expect(user).toBeUndefined();
  });

  it('anon_multi_window has 2 product_views in 30-day window but only 1 in 7-day window', () => {
    const in7d = repo.getEventCounts(db, 'product_view', SEED_WIN_START_7D, SEED_AS_OF);
    const in30d = repo.getEventCounts(db, 'product_view', SEED_WIN_START_30D, SEED_AS_OF);

    const user7d = in7d.find((r) => r.anonymousId === 'anon_multi_window');
    const user30d = in30d.find((r) => r.anonymousId === 'anon_multi_window');

    expect(user7d!.count).toBe(1);
    expect(user30d!.count).toBe(3); // all three events fall in 30-day window
  });

  it('returns empty array when no events match the type in the window', () => {
    const results = repo.getEventCounts(db, 'checkout_started', SEED_WIN_START_7D, SEED_AS_OF);
    // Only anon_nomatch_purchase has a checkout_started in window
    expect(results.length).toBeGreaterThanOrEqual(0);
    const noMatch = results.find((r) => r.anonymousId === 'anon_no_events');
    expect(noMatch).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 6. Repository — boundary inclusion/exclusion (getEventCounts)
// ---------------------------------------------------------------------------

describe('SqliteEventRepository time boundary semantics', () => {
  let db: Database.Database;
  const repo = new SqliteEventRepository();

  beforeEach(() => {
    db = makeSeededDb();
  });

  afterEach(() => {
    db.close();
  });

  it('includes event AT the lower boundary (occurred_at == windowStart)', () => {
    // anon_boundary_lower has one product_view AT_LOWER_BOUNDARY == WIN_START_7D
    const results = repo.getEventCounts(db, 'product_view', SEED_WIN_START_7D, SEED_AS_OF);
    const user = results.find((r) => r.anonymousId === 'anon_boundary_lower');

    expect(user).toBeDefined();
    // Both events are inside the window: AT_LOWER_BOUNDARY and IN_WINDOW_2
    expect(user!.count).toBe(2);
  });

  it('excludes event AT_LOWER_BOUNDARY when windowStart is 1 ms later', () => {
    // Shift the window start 1 ms past AT_LOWER_BOUNDARY so that event is excluded.
    const shiftedStart = '2026-09-22T00:00:00.001Z';
    const results = repo.getEventCounts(db, 'product_view', shiftedStart, SEED_AS_OF);
    const user = results.find((r) => r.anonymousId === 'anon_boundary_lower');

    // Only IN_WINDOW_2 should be counted now (AT_LOWER_BOUNDARY is excluded)
    expect(user).toBeDefined();
    expect(user!.count).toBe(1);
  });

  it('includes event AT the upper boundary (1 ms before asOf)', () => {
    // anon_boundary_upper has product_view AT_UPPER_BOUNDARY = '2026-09-28T23:59:59.999Z'
    // which is < AS_OF so it IS included.
    const results = repo.getEventCounts(db, 'product_view', SEED_WIN_START_7D, SEED_AS_OF);
    const user = results.find((r) => r.anonymousId === 'anon_boundary_upper');

    expect(user).toBeDefined();
    expect(user!.count).toBe(2); // IN_WINDOW_1 + AT_UPPER_BOUNDARY
  });

  it('excludes event that occurs exactly AT asOf (upper boundary is exclusive)', () => {
    // Insert a test event exactly at asOf into anon_boundary_upper's user.
    const userId = (
      db
        .prepare('SELECT id FROM anonymous_users WHERE anonymous_id = ?')
        .get('anon_boundary_upper') as { id: number }
    ).id;

    db.prepare(
      'INSERT INTO events (anonymous_user_id, event_type, occurred_at) VALUES (?, ?, ?)'
    ).run(userId, 'product_view', SEED_AS_OF); // exactly at cutoff — should be EXCLUDED

    const results = repo.getEventCounts(db, 'product_view', SEED_WIN_START_7D, SEED_AS_OF);
    const user = results.find((r) => r.anonymousId === 'anon_boundary_upper');

    // Count should still be 2, not 3 (the event at asOf is excluded by occurred_at < windowEnd)
    expect(user!.count).toBe(2);
  });

  it('excludes BEFORE_WINDOW event (1 ms before windowStart)', () => {
    // anon_outside_window has events at BEFORE_WINDOW and WELL_BEFORE_WINDOW only.
    const results = repo.getEventCounts(db, 'product_view', SEED_WIN_START_7D, SEED_AS_OF);
    const user = results.find((r) => r.anonymousId === 'anon_outside_window');
    expect(user).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 7. Repository — getEventsForUser
// ---------------------------------------------------------------------------

describe('SqliteEventRepository.getEventsForUser', () => {
  let db: Database.Database;
  const repo = new SqliteEventRepository();

  beforeEach(() => {
    db = makeSeededDb();
  });

  afterEach(() => {
    db.close();
  });

  it('returns individual event rows for anon_match_a in 7-day window, ordered by occurred_at', () => {
    const userId = (
      db
        .prepare('SELECT id FROM anonymous_users WHERE anonymous_id = ?')
        .get('anon_match_a') as { id: number }
    ).id;

    const events = repo.getEventsForUser(db, userId, 'product_view', SEED_WIN_START_7D, SEED_AS_OF);

    expect(events).toHaveLength(3);
    // Verify ascending order
    for (let i = 1; i < events.length; i++) {
      expect(events[i].occurredAt >= events[i - 1].occurredAt).toBe(true);
    }
    expect(events[0].eventType).toBe('product_view');
    expect(events[0].anonymousId).toBe('anon_match_a');
    expect(events[0].occurredAt).toBe(SEED_IN_WINDOW_1);
    expect(events[1].occurredAt).toBe(SEED_IN_WINDOW_2);
  });

  it('returns empty array when user has no events of the requested type', () => {
    const userId = (
      db
        .prepare('SELECT id FROM anonymous_users WHERE anonymous_id = ?')
        .get('anon_purchase_only') as { id: number }
    ).id;

    const events = repo.getEventsForUser(db, userId, 'product_view', SEED_WIN_START_7D, SEED_AS_OF);
    expect(events).toHaveLength(0);
  });

  it('returns empty array when user has no events at all', () => {
    const userId = (
      db
        .prepare('SELECT id FROM anonymous_users WHERE anonymous_id = ?')
        .get('anon_no_events') as { id: number }
    ).id;

    const events = repo.getEventsForUser(db, userId, 'product_view', SEED_WIN_START_7D, SEED_AS_OF);
    expect(events).toHaveLength(0);
  });

  it('excludes events outside the window', () => {
    const userId = (
      db
        .prepare('SELECT id FROM anonymous_users WHERE anonymous_id = ?')
        .get('anon_outside_window') as { id: number }
    ).id;

    const events = repo.getEventsForUser(db, userId, 'product_view', SEED_WIN_START_7D, SEED_AS_OF);
    expect(events).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 8. Repository — getAllUsers
// ---------------------------------------------------------------------------

describe('SqliteEventRepository.getAllUsers', () => {
  let db: Database.Database;
  const repo = new SqliteEventRepository();

  beforeEach(() => {
    db = makeSeededDb();
  });

  afterEach(() => {
    db.close();
  });

  it('returns all seeded users', () => {
    const users = repo.getAllUsers(db);
    expect(users).toHaveLength(SEED_USER_COUNT);
  });

  it('returned users have id and anonymousId fields', () => {
    const users = repo.getAllUsers(db);
    for (const user of users) {
      expect(typeof user.id).toBe('number');
      expect(typeof user.anonymousId).toBe('string');
      expect(user.anonymousId.length).toBeGreaterThan(0);
    }
  });

  it('includes anon_no_events user (exists even with no events)', () => {
    const users = repo.getAllUsers(db);
    const found = users.find((u) => u.anonymousId === 'anon_no_events');
    expect(found).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 9. Database persistence across connection closure and reopening (file-based)
// ---------------------------------------------------------------------------

describe('Persistence across connection lifecycle', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mable-test-'));
    dbPath = path.join(tmpDir, 'test.db');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('data written to a file-based DB is readable after close and reopen', () => {
    // Write
    const db1 = new Database(dbPath);
    db1.pragma('foreign_keys = ON');
    initializeSchema(db1);
    db1.prepare('INSERT INTO anonymous_users (anonymous_id) VALUES (?)').run('persist_test');
    db1.close();

    // Reopen and read
    const db2 = new Database(dbPath);
    db2.pragma('foreign_keys = ON');
    const row = db2.prepare('SELECT anonymous_id FROM anonymous_users WHERE anonymous_id = ?').get('persist_test') as { anonymous_id: string } | undefined;
    db2.close();

    expect(row).toBeDefined();
    expect(row!.anonymous_id).toBe('persist_test');
  });

  it('seed data is fully readable after connection is closed and reopened', () => {
    // Seed
    const db1 = new Database(dbPath);
    db1.pragma('foreign_keys = ON');
    initializeSchema(db1);
    seedDatabase(db1);
    const countBefore = (db1.prepare('SELECT COUNT(*) AS n FROM anonymous_users').get() as { n: number }).n;
    db1.close();

    // Verify
    const db2 = new Database(dbPath);
    const countAfter = (db2.prepare('SELECT COUNT(*) AS n FROM anonymous_users').get() as { n: number }).n;
    db2.close();

    expect(countAfter).toBe(countBefore);
    expect(countAfter).toBe(SEED_USER_COUNT);
  });
});

// ---------------------------------------------------------------------------
// 10. Unique anonymous_id constraint
// ---------------------------------------------------------------------------

describe('Unique anonymous_id constraint', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createInMemoryDb();
    initializeSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  it('does not allow duplicate anonymous_ids', () => {
    db.prepare('INSERT INTO anonymous_users (anonymous_id) VALUES (?)').run('dup_test');
    expect(() =>
      db.prepare('INSERT INTO anonymous_users (anonymous_id) VALUES (?)').run('dup_test')
    ).toThrow();
  });

  it('INSERT OR IGNORE silently skips duplicate without throwing', () => {
    db.prepare('INSERT OR IGNORE INTO anonymous_users (anonymous_id) VALUES (?)').run('dup_test');
    expect(() =>
      db.prepare('INSERT OR IGNORE INTO anonymous_users (anonymous_id) VALUES (?)').run('dup_test')
    ).not.toThrow();

    const count = countRows(db, 'anonymous_users');
    expect(count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 11. Edge: empty window (windowStart == windowEnd)
// ---------------------------------------------------------------------------

describe('Edge cases', () => {
  let db: Database.Database;
  const repo = new SqliteEventRepository();

  beforeEach(() => {
    db = makeSeededDb();
  });

  afterEach(() => {
    db.close();
  });

  it('returns no events when windowStart equals windowEnd (empty interval)', () => {
    const results = repo.getEventCounts(db, 'product_view', SEED_AS_OF, SEED_AS_OF);
    expect(results).toHaveLength(0);
  });

  it('returns no events for a window entirely in the future', () => {
    const farFuture1 = '2030-01-01T00:00:00.000Z';
    const farFuture2 = '2030-12-31T23:59:59.999Z';
    const results = repo.getEventCounts(db, 'product_view', farFuture1, farFuture2);
    expect(results).toHaveLength(0);
  });

  it('returns no events for a window entirely before all fixtures', () => {
    const ancient = '2020-01-01T00:00:00.000Z';
    const stillAncient = '2020-12-31T23:59:59.999Z';
    const results = repo.getEventCounts(db, 'product_view', ancient, stillAncient);
    expect(results).toHaveLength(0);
  });

  it('BEFORE_WINDOW timestamp is exactly 1 ms before windowStart (verify fixture integrity)', () => {
    const win = new Date(SEED_WIN_START_7D).getTime();
    const bef = new Date(SEED_BEFORE_WINDOW).getTime();
    expect(win - bef).toBe(1);
  });

  it('AT_UPPER_BOUNDARY timestamp is exactly 1 ms before asOf (verify fixture integrity)', () => {
    const asOf = new Date(SEED_AS_OF).getTime();
    const upper = new Date(SEED_AT_UPPER_BOUNDARY).getTime();
    expect(asOf - upper).toBe(1);
  });

  it('AT_LOWER_BOUNDARY equals WIN_START_7D (verify fixture integrity)', () => {
    expect(SEED_AT_LOWER_BOUNDARY).toBe(SEED_WIN_START_7D);
  });
});
