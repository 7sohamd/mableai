/**
 * Unit tests for AudienceEvaluationService.
 *
 * All tests use:
 *   - Isolated in-memory SQLite databases (never touch the dev seed DB)
 *   - Explicit fixture timestamps calculated independently from the evaluator
 *   - The canonical asOf: 2026-09-29T00:00:00.000Z
 *   - Hand-calculated expected results, not derived from the implementation
 *
 * Window arithmetic reference (for independent verification):
 *   asOf          = 2026-09-29T00:00:00.000Z  (= 1759104000000 ms)
 *   7d windowStart = asOf - 7*86400000         = 2026-09-22T00:00:00.000Z
 *   30d windowStart = asOf - 30*86400000        = 2026-08-30T00:00:00.000Z
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createInMemoryDb } from '../../src/db/connection';
import { initializeSchema } from '../../src/db/schema';
import { seedDatabase } from '../../src/db/seed';
import { SqliteEventRepository } from '../../src/repositories/eventRepository';
import { AudienceEvaluationService } from '../../src/services/audienceEvaluationService';
import { AudiencePreviewRequest } from '../../src/contracts/audiencePreview';

// ---------------------------------------------------------------------------
// Constants — all independently verified, NOT derived from the evaluator code
// ---------------------------------------------------------------------------

const AS_OF = '2026-09-29T00:00:00.000Z';

// 7-day window: [2026-09-22T00:00:00.000Z, 2026-09-29T00:00:00.000Z)
const WIN_7D_START = '2026-09-22T00:00:00.000Z';

// 30-day window: [2026-08-30T00:00:00.000Z, 2026-09-29T00:00:00.000Z)
const WIN_30D_START = '2026-08-30T00:00:00.000Z';

// Timestamps inside the 7-day window
const T_IN_WINDOW_1 = '2026-09-23T08:00:00.000Z';
const T_IN_WINDOW_2 = '2026-09-25T14:30:00.000Z';
const T_IN_WINDOW_3 = '2026-09-27T11:00:00.000Z';

// Boundary timestamps
const T_AT_WIN_START = '2026-09-22T00:00:00.000Z'; // == WIN_7D_START, included
const T_ONE_MS_BEFORE_WIN_START = '2026-09-21T23:59:59.999Z'; // excluded
const T_ONE_MS_BEFORE_AS_OF = '2026-09-28T23:59:59.999Z';    // included
const T_AT_AS_OF = '2026-09-29T00:00:00.000Z';                // excluded
const T_AFTER_AS_OF = '2026-09-30T00:00:00.000Z';             // excluded

// A timestamp inside 30d but outside 7d window
const T_IN_30D_ONLY = '2026-09-10T09:00:00.000Z'; // 2026-09-10 is in 30d, outside 7d

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a fresh isolated in-memory DB with schema applied. */
function makeDb(): Database.Database {
  const db = createInMemoryDb();
  initializeSchema(db);
  return db;
}

/** Insert a user and return their internal integer id. */
function insertUser(db: Database.Database, anonymousId: string): number {
  db.prepare('INSERT INTO anonymous_users (anonymous_id) VALUES (?)').run(anonymousId);
  return (
    db.prepare('SELECT id FROM anonymous_users WHERE anonymous_id = ?').get(anonymousId) as {
      id: number;
    }
  ).id;
}

/** Insert a single event row. */
function insertEvent(
  db: Database.Database,
  userId: number,
  eventType: string,
  occurredAt: string
): void {
  db.prepare(
    'INSERT INTO events (anonymous_user_id, event_type, occurred_at) VALUES (?, ?, ?)'
  ).run(userId, eventType, occurredAt);
}

/** Convenience: build the service wired to a given DB. */
function makeService(db: Database.Database): AudienceEvaluationService {
  return new AudienceEvaluationService(new SqliteEventRepository(), db);
}

/** Canonical two-condition request used throughout the tests. */
const CANONICAL_REQUEST: AudiencePreviewRequest = {
  name: 'Viewed but not purchased',
  asOf: AS_OF,
  conditions: [
    {
      eventType: 'product_view',
      operator: 'at_least',
      count: 2,
      withinDays: 7,
    },
    {
      eventType: 'purchase',
      operator: 'exactly',
      count: 0,
      withinDays: 7,
    },
  ],
};

// ---------------------------------------------------------------------------
// 1. at_least operator
// ---------------------------------------------------------------------------

describe('Operator: at_least', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
  });
  afterEach(() => db.close());

  it('does NOT match user with count below threshold (1 < 2)', async () => {
    const uid = insertUser(db, 'u1');
    insertEvent(db, uid, 'product_view', T_IN_WINDOW_1); // count = 1

    const svc = makeService(db);
    const result = await svc.previewAudience({
      name: 'test',
      asOf: AS_OF,
      conditions: [{ eventType: 'product_view', operator: 'at_least', count: 2, withinDays: 7 }],
    });

    expect(result.matchedUsers).toHaveLength(0);
    expect(result.totalMatchedUsers).toBe(0);
  });

  it('matches user with count exactly at threshold (2 >= 2)', async () => {
    const uid = insertUser(db, 'u1');
    insertEvent(db, uid, 'product_view', T_IN_WINDOW_1);
    insertEvent(db, uid, 'product_view', T_IN_WINDOW_2); // count = 2

    const svc = makeService(db);
    const result = await svc.previewAudience({
      name: 'test',
      asOf: AS_OF,
      conditions: [{ eventType: 'product_view', operator: 'at_least', count: 2, withinDays: 7 }],
    });

    expect(result.matchedUsers).toHaveLength(1);
    expect(result.matchedUsers[0].userId).toBe('u1');
    expect(result.matchedUsers[0].evidence[0].actualCount).toBe(2);
    expect(result.totalMatchedUsers).toBe(1);
  });

  it('matches user with count above threshold (3 >= 2)', async () => {
    const uid = insertUser(db, 'u1');
    insertEvent(db, uid, 'product_view', T_IN_WINDOW_1);
    insertEvent(db, uid, 'product_view', T_IN_WINDOW_2);
    insertEvent(db, uid, 'product_view', T_IN_WINDOW_3); // count = 3

    const svc = makeService(db);
    const result = await svc.previewAudience({
      name: 'test',
      asOf: AS_OF,
      conditions: [{ eventType: 'product_view', operator: 'at_least', count: 2, withinDays: 7 }],
    });

    expect(result.matchedUsers).toHaveLength(1);
    expect(result.matchedUsers[0].evidence[0].actualCount).toBe(3);
  });

  it('matches user with at_least:0 even with no events (0 >= 0)', async () => {
    insertUser(db, 'u1'); // no events

    const svc = makeService(db);
    const result = await svc.previewAudience({
      name: 'test',
      asOf: AS_OF,
      conditions: [{ eventType: 'product_view', operator: 'at_least', count: 0, withinDays: 7 }],
    });

    expect(result.matchedUsers).toHaveLength(1);
    expect(result.matchedUsers[0].evidence[0].actualCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. exactly operator
// ---------------------------------------------------------------------------

describe('Operator: exactly', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
  });
  afterEach(() => db.close());

  it('matches user with exactly the target count (2 == 2)', async () => {
    const uid = insertUser(db, 'u1');
    insertEvent(db, uid, 'purchase', T_IN_WINDOW_1);
    insertEvent(db, uid, 'purchase', T_IN_WINDOW_2); // count = 2

    const svc = makeService(db);
    const result = await svc.previewAudience({
      name: 'test',
      asOf: AS_OF,
      conditions: [{ eventType: 'purchase', operator: 'exactly', count: 2, withinDays: 7 }],
    });

    expect(result.matchedUsers).toHaveLength(1);
    expect(result.matchedUsers[0].evidence[0].actualCount).toBe(2);
  });

  it('does NOT match user with count != target (3 != 2)', async () => {
    const uid = insertUser(db, 'u1');
    insertEvent(db, uid, 'purchase', T_IN_WINDOW_1);
    insertEvent(db, uid, 'purchase', T_IN_WINDOW_2);
    insertEvent(db, uid, 'purchase', T_IN_WINDOW_3); // count = 3

    const svc = makeService(db);
    const result = await svc.previewAudience({
      name: 'test',
      asOf: AS_OF,
      conditions: [{ eventType: 'purchase', operator: 'exactly', count: 2, withinDays: 7 }],
    });

    expect(result.matchedUsers).toHaveLength(0);
  });

  it('matches user with exactly:0 when user has no events (0 == 0)', async () => {
    insertUser(db, 'u1'); // no events

    const svc = makeService(db);
    const result = await svc.previewAudience({
      name: 'test',
      asOf: AS_OF,
      conditions: [{ eventType: 'purchase', operator: 'exactly', count: 0, withinDays: 7 }],
    });

    expect(result.matchedUsers).toHaveLength(1);
    expect(result.matchedUsers[0].evidence[0].actualCount).toBe(0);
    expect(result.matchedUsers[0].evidence[0].targetCount).toBe(0);
  });

  it('matches user with exactly:0 when their events are outside the window', async () => {
    const uid = insertUser(db, 'u1');
    // Event is 1 ms before window start — NOT counted
    insertEvent(db, uid, 'purchase', T_ONE_MS_BEFORE_WIN_START);

    const svc = makeService(db);
    const result = await svc.previewAudience({
      name: 'test',
      asOf: AS_OF,
      conditions: [{ eventType: 'purchase', operator: 'exactly', count: 0, withinDays: 7 }],
    });

    expect(result.matchedUsers).toHaveLength(1);
    expect(result.matchedUsers[0].evidence[0].actualCount).toBe(0);
  });

  it('does NOT match user with exactly:0 when they have an event in the window', async () => {
    const uid = insertUser(db, 'u1');
    insertEvent(db, uid, 'purchase', T_IN_WINDOW_1); // count = 1 in window

    const svc = makeService(db);
    const result = await svc.previewAudience({
      name: 'test',
      asOf: AS_OF,
      conditions: [{ eventType: 'purchase', operator: 'exactly', count: 0, withinDays: 7 }],
    });

    expect(result.matchedUsers).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 3. AND semantics with multiple conditions
// ---------------------------------------------------------------------------

describe('AND semantics', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
  });
  afterEach(() => db.close());

  it('matches only users satisfying ALL conditions', async () => {
    // u1: satisfies both — 2 product_views, 0 purchases
    const u1 = insertUser(db, 'u1');
    insertEvent(db, u1, 'product_view', T_IN_WINDOW_1);
    insertEvent(db, u1, 'product_view', T_IN_WINDOW_2);

    // u2: fails purchase condition — has a purchase
    const u2 = insertUser(db, 'u2');
    insertEvent(db, u2, 'product_view', T_IN_WINDOW_1);
    insertEvent(db, u2, 'product_view', T_IN_WINDOW_2);
    insertEvent(db, u2, 'purchase', T_IN_WINDOW_3);

    // u3: fails product_view condition — only 1 view
    const u3 = insertUser(db, 'u3');
    insertEvent(db, u3, 'product_view', T_IN_WINDOW_1);

    const svc = makeService(db);
    const result = await svc.previewAudience(CANONICAL_REQUEST);

    expect(result.matchedUsers).toHaveLength(1);
    expect(result.matchedUsers[0].userId).toBe('u1');
    expect(result.totalMatchedUsers).toBe(1);
    expect(result.matchedAnonymousUsers).toBe(1);

    // Verify u2 and u3 are NOT in matched list
    const ids = result.matchedUsers.map((u) => u.userId);
    expect(ids).not.toContain('u2');
    expect(ids).not.toContain('u3');
  });

  it('returns empty audience when no user satisfies all conditions', async () => {
    const u1 = insertUser(db, 'u1');
    insertEvent(db, u1, 'product_view', T_IN_WINDOW_1); // only 1, needs 2

    const svc = makeService(db);
    const result = await svc.previewAudience(CANONICAL_REQUEST);

    expect(result.matchedUsers).toHaveLength(0);
    expect(result.totalMatchedUsers).toBe(0);
    expect(result.name).toBe(CANONICAL_REQUEST.name);
    expect(result.asOf).toBe(AS_OF);
  });

  it('evidence array has one entry per condition, in order', async () => {
    const u1 = insertUser(db, 'u1');
    insertEvent(db, u1, 'product_view', T_IN_WINDOW_1);
    insertEvent(db, u1, 'product_view', T_IN_WINDOW_2);
    // no purchases — satisfies exactly:0

    const svc = makeService(db);
    const result = await svc.previewAudience(CANONICAL_REQUEST);

    expect(result.matchedUsers).toHaveLength(1);
    const evidence = result.matchedUsers[0].evidence;
    expect(evidence).toHaveLength(2);
    expect(evidence[0].conditionIndex).toBe(0);
    expect(evidence[0].eventType).toBe('product_view');
    expect(evidence[0].operator).toBe('at_least');
    expect(evidence[0].targetCount).toBe(2);
    expect(evidence[0].actualCount).toBe(2);
    expect(evidence[1].conditionIndex).toBe(1);
    expect(evidence[1].eventType).toBe('purchase');
    expect(evidence[1].operator).toBe('exactly');
    expect(evidence[1].targetCount).toBe(0);
    expect(evidence[1].actualCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Time boundary semantics
// ---------------------------------------------------------------------------

describe('Time boundary semantics', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
  });
  afterEach(() => db.close());

  it('includes event exactly AT windowStart (occurred_at == windowStart)', async () => {
    const uid = insertUser(db, 'u1');
    // Both at lower boundary and in window — total = 2, satisfies at_least:2
    insertEvent(db, uid, 'product_view', T_AT_WIN_START);   // == WIN_7D_START, INCLUDED
    insertEvent(db, uid, 'product_view', T_IN_WINDOW_2);

    const svc = makeService(db);
    const result = await svc.previewAudience({
      name: 'test',
      asOf: AS_OF,
      conditions: [{ eventType: 'product_view', operator: 'at_least', count: 2, withinDays: 7 }],
    });

    expect(result.matchedUsers).toHaveLength(1);
    expect(result.matchedUsers[0].evidence[0].actualCount).toBe(2);
  });

  it('excludes event 1 ms before windowStart', async () => {
    const uid = insertUser(db, 'u1');
    insertEvent(db, uid, 'product_view', T_ONE_MS_BEFORE_WIN_START); // EXCLUDED
    insertEvent(db, uid, 'product_view', T_IN_WINDOW_2);              // count in window = 1

    const svc = makeService(db);
    const result = await svc.previewAudience({
      name: 'test',
      asOf: AS_OF,
      conditions: [{ eventType: 'product_view', operator: 'at_least', count: 2, withinDays: 7 }],
    });

    // Only 1 event counted — does not meet at_least:2
    expect(result.matchedUsers).toHaveLength(0);
  });

  it('includes event 1 ms before asOf (upper boundary exclusive)', async () => {
    const uid = insertUser(db, 'u1');
    insertEvent(db, uid, 'product_view', T_IN_WINDOW_1);
    insertEvent(db, uid, 'product_view', T_ONE_MS_BEFORE_AS_OF); // INCLUDED

    const svc = makeService(db);
    const result = await svc.previewAudience({
      name: 'test',
      asOf: AS_OF,
      conditions: [{ eventType: 'product_view', operator: 'at_least', count: 2, withinDays: 7 }],
    });

    expect(result.matchedUsers).toHaveLength(1);
    expect(result.matchedUsers[0].evidence[0].actualCount).toBe(2);
  });

  it('excludes event exactly AT asOf', async () => {
    const uid = insertUser(db, 'u1');
    insertEvent(db, uid, 'product_view', T_IN_WINDOW_1);
    insertEvent(db, uid, 'product_view', T_AT_AS_OF); // == asOf, EXCLUDED

    const svc = makeService(db);
    const result = await svc.previewAudience({
      name: 'test',
      asOf: AS_OF,
      conditions: [{ eventType: 'product_view', operator: 'at_least', count: 2, withinDays: 7 }],
    });

    // Only 1 event counted (T_IN_WINDOW_1); T_AT_AS_OF excluded
    expect(result.matchedUsers).toHaveLength(0);
  });

  it('excludes events after asOf', async () => {
    const uid = insertUser(db, 'u1');
    insertEvent(db, uid, 'product_view', T_AFTER_AS_OF); // EXCLUDED — after asOf
    insertEvent(db, uid, 'product_view', T_AFTER_AS_OF); // EXCLUDED

    const svc = makeService(db);
    const result = await svc.previewAudience({
      name: 'test',
      asOf: AS_OF,
      conditions: [{ eventType: 'product_view', operator: 'at_least', count: 1, withinDays: 7 }],
    });

    expect(result.matchedUsers).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Users with no relevant events
// ---------------------------------------------------------------------------

describe('Users with no events', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
  });
  afterEach(() => db.close());

  it('user with no events does not match at_least:1', async () => {
    insertUser(db, 'u1');

    const svc = makeService(db);
    const result = await svc.previewAudience({
      name: 'test',
      asOf: AS_OF,
      conditions: [{ eventType: 'product_view', operator: 'at_least', count: 1, withinDays: 7 }],
    });

    expect(result.matchedUsers).toHaveLength(0);
  });

  it('user with no events matches exactly:0', async () => {
    insertUser(db, 'u1');

    const svc = makeService(db);
    const result = await svc.previewAudience({
      name: 'test',
      asOf: AS_OF,
      conditions: [{ eventType: 'purchase', operator: 'exactly', count: 0, withinDays: 7 }],
    });

    expect(result.matchedUsers).toHaveLength(1);
    expect(result.matchedUsers[0].userId).toBe('u1');
  });

  it('user with events of a different type does not match the requested type', async () => {
    const uid = insertUser(db, 'u1');
    insertEvent(db, uid, 'page_view', T_IN_WINDOW_1);
    insertEvent(db, uid, 'page_view', T_IN_WINDOW_2);

    const svc = makeService(db);
    const result = await svc.previewAudience({
      name: 'test',
      asOf: AS_OF,
      conditions: [{ eventType: 'product_view', operator: 'at_least', count: 1, withinDays: 7 }],
    });

    expect(result.matchedUsers).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Multiple conditions with the same event type, different windows
// ---------------------------------------------------------------------------

describe('Multiple conditions: same event type, different windows', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
  });
  afterEach(() => db.close());

  it('evaluates each condition in its own window independently', async () => {
    // u1: has 1 product_view in 7d and 3 product_views in 30d
    const u1 = insertUser(db, 'u1');
    insertEvent(db, u1, 'product_view', T_IN_WINDOW_1);   // in 7d AND 30d
    insertEvent(db, u1, 'product_view', T_IN_30D_ONLY);   // in 30d only
    insertEvent(db, u1, 'product_view', T_IN_30D_ONLY);   // in 30d only

    const svc = makeService(db);
    // Condition 0: product_view at_least 1 in 7d  (u1 has 1 — should PASS)
    // Condition 1: product_view at_least 3 in 30d (u1 has 3 — should PASS)
    const result = await svc.previewAudience({
      name: 'test',
      asOf: AS_OF,
      conditions: [
        { id: 'c7d',  eventType: 'product_view', operator: 'at_least', count: 1, withinDays: 7  },
        { id: 'c30d', eventType: 'product_view', operator: 'at_least', count: 3, withinDays: 30 },
      ],
    });

    expect(result.matchedUsers).toHaveLength(1);
    const ev = result.matchedUsers[0].evidence;
    expect(ev[0].withinDays).toBe(7);
    expect(ev[0].actualCount).toBe(1); // only the one T_IN_WINDOW_1 event
    expect(ev[1].withinDays).toBe(30);
    expect(ev[1].actualCount).toBe(3); // all three events
  });

  it('does NOT conflate counts from different windows', async () => {
    // u1: 2 events in 30d only, 0 in 7d — should NOT satisfy at_least:1 in 7d
    const u1 = insertUser(db, 'u1');
    insertEvent(db, u1, 'product_view', T_IN_30D_ONLY); // in 30d, NOT in 7d
    insertEvent(db, u1, 'product_view', T_IN_30D_ONLY); // in 30d, NOT in 7d

    const svc = makeService(db);
    const result = await svc.previewAudience({
      name: 'test',
      asOf: AS_OF,
      conditions: [
        { eventType: 'product_view', operator: 'at_least', count: 1, withinDays: 7  },
        { eventType: 'product_view', operator: 'at_least', count: 2, withinDays: 30 },
      ],
    });

    // Fails condition 0 (0 events in 7d window)
    expect(result.matchedUsers).toHaveLength(0);
  });

  it('deduplicates queries for identical (type, window) pairs across conditions', async () => {
    // Two conditions with identical event type and withinDays — should share a query.
    // We verify correctness (not internal query count directly).
    const u1 = insertUser(db, 'u1');
    insertEvent(db, u1, 'product_view', T_IN_WINDOW_1);
    insertEvent(db, u1, 'product_view', T_IN_WINDOW_2);

    const svc = makeService(db);
    const result = await svc.previewAudience({
      name: 'test',
      asOf: AS_OF,
      conditions: [
        // identical window — should share one SQL fetch
        { id: 'c1', eventType: 'product_view', operator: 'at_least', count: 2, withinDays: 7 },
        { id: 'c2', eventType: 'product_view', operator: 'at_least', count: 1, withinDays: 7 },
      ],
    });

    expect(result.matchedUsers).toHaveLength(1);
    const ev = result.matchedUsers[0].evidence;
    // Both conditions report the same actual count from the shared query
    expect(ev[0].actualCount).toBe(2);
    expect(ev[1].actualCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 7. Response shape and totals
// ---------------------------------------------------------------------------

describe('Response shape and totals', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
  });
  afterEach(() => db.close());

  it('totalMatchedUsers exactly equals matchedUsers.length', async () => {
    const u1 = insertUser(db, 'u1');
    insertEvent(db, u1, 'product_view', T_IN_WINDOW_1);
    insertEvent(db, u1, 'product_view', T_IN_WINDOW_2);

    const u2 = insertUser(db, 'u2');
    insertEvent(db, u2, 'product_view', T_IN_WINDOW_1);
    insertEvent(db, u2, 'product_view', T_IN_WINDOW_2);

    const svc = makeService(db);
    const result = await svc.previewAudience({
      name: 'test',
      asOf: AS_OF,
      conditions: [{ eventType: 'product_view', operator: 'at_least', count: 2, withinDays: 7 }],
    });

    expect(result.totalMatchedUsers).toBe(result.matchedUsers.length);
    expect(result.totalMatchedUsers).toBe(2);
  });

  it('matchedAnonymousUsers equals matchedUsers.length (all users are anonymous)', async () => {
    const u1 = insertUser(db, 'u1');
    insertEvent(db, u1, 'product_view', T_IN_WINDOW_1);
    insertEvent(db, u1, 'product_view', T_IN_WINDOW_2);

    const svc = makeService(db);
    const result = await svc.previewAudience({
      name: 'test',
      asOf: AS_OF,
      conditions: [{ eventType: 'product_view', operator: 'at_least', count: 2, withinDays: 7 }],
    });

    expect(result.matchedAnonymousUsers).toBe(result.totalMatchedUsers);
  });

  it('response name and asOf are echoed from the request', async () => {
    const svc = makeService(db);
    const result = await svc.previewAudience({
      name: 'My Audience',
      asOf: AS_OF,
      conditions: [{ eventType: 'page_view', operator: 'exactly', count: 0, withinDays: 7 }],
    });

    expect(result.name).toBe('My Audience');
    expect(result.asOf).toBe(AS_OF);
  });

  it('every matched user has isAnonymous = true', async () => {
    const uid = insertUser(db, 'u1');
    insertEvent(db, uid, 'product_view', T_IN_WINDOW_1);
    insertEvent(db, uid, 'product_view', T_IN_WINDOW_2);

    const svc = makeService(db);
    const result = await svc.previewAudience({
      name: 'test',
      asOf: AS_OF,
      conditions: [{ eventType: 'product_view', operator: 'at_least', count: 2, withinDays: 7 }],
    });

    for (const user of result.matchedUsers) {
      expect(user.isAnonymous).toBe(true);
    }
  });

  it('evidence windowStart and windowEnd are correct ISO 8601 strings', async () => {
    const uid = insertUser(db, 'u1');
    insertEvent(db, uid, 'product_view', T_IN_WINDOW_1);
    insertEvent(db, uid, 'product_view', T_IN_WINDOW_2);

    const svc = makeService(db);
    const result = await svc.previewAudience({
      name: 'test',
      asOf: AS_OF,
      conditions: [{ eventType: 'product_view', operator: 'at_least', count: 2, withinDays: 7 }],
    });

    const ev = result.matchedUsers[0].evidence[0];
    // Independently calculated: asOf - 7*86400000ms = 2026-09-22T00:00:00.000Z
    expect(ev.windowStart).toBe(WIN_7D_START);
    expect(ev.windowEnd).toBe(AS_OF);
  });

  it('evidence conditionId is undefined when not supplied in request', async () => {
    const uid = insertUser(db, 'u1');
    insertEvent(db, uid, 'product_view', T_IN_WINDOW_1);
    insertEvent(db, uid, 'product_view', T_IN_WINDOW_2);

    const svc = makeService(db);
    const result = await svc.previewAudience({
      name: 'test',
      asOf: AS_OF,
      conditions: [
        // No id field supplied
        { eventType: 'product_view', operator: 'at_least', count: 2, withinDays: 7 },
      ],
    });

    expect(result.matchedUsers[0].evidence[0].conditionId).toBeUndefined();
  });

  it('evidence conditionId is propagated from request when supplied', async () => {
    const uid = insertUser(db, 'u1');
    insertEvent(db, uid, 'product_view', T_IN_WINDOW_1);
    insertEvent(db, uid, 'product_view', T_IN_WINDOW_2);

    const svc = makeService(db);
    const result = await svc.previewAudience({
      name: 'test',
      asOf: AS_OF,
      conditions: [
        { id: 'my_cond', eventType: 'product_view', operator: 'at_least', count: 2, withinDays: 7 },
      ],
    });

    expect(result.matchedUsers[0].evidence[0].conditionId).toBe('my_cond');
  });
});

// ---------------------------------------------------------------------------
// 8. Deterministic results for a fixed asOf
// ---------------------------------------------------------------------------

describe('Determinism', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
  });
  afterEach(() => db.close());

  it('returns identical results when called twice with same request and data', async () => {
    const uid = insertUser(db, 'u1');
    insertEvent(db, uid, 'product_view', T_IN_WINDOW_1);
    insertEvent(db, uid, 'product_view', T_IN_WINDOW_2);

    const svc = makeService(db);
    const req: AudiencePreviewRequest = {
      name: 'test',
      asOf: AS_OF,
      conditions: [{ eventType: 'product_view', operator: 'at_least', count: 2, withinDays: 7 }],
    };

    const r1 = await svc.previewAudience(req);
    const r2 = await svc.previewAudience(req);

    expect(r1.totalMatchedUsers).toBe(r2.totalMatchedUsers);
    expect(r1.matchedUsers[0].userId).toBe(r2.matchedUsers[0].userId);
  });

  it('changing asOf changes which events fall in the window', async () => {
    // u1 has events on 2026-09-23 — inside the 7d window ending 2026-09-29
    // but outside the 7d window ending 2026-09-22 (windowStart would be 2026-09-15)
    const uid = insertUser(db, 'u1');
    insertEvent(db, uid, 'product_view', T_IN_WINDOW_1); // 2026-09-23
    insertEvent(db, uid, 'product_view', T_IN_WINDOW_2); // 2026-09-25

    const svc = makeService(db);

    // With canonical asOf (2026-09-29): window [2026-09-22, 2026-09-29) → 2 events → matches
    const resultWithCanonicalAsOf = await svc.previewAudience({
      name: 'test',
      asOf: AS_OF,
      conditions: [{ eventType: 'product_view', operator: 'at_least', count: 2, withinDays: 7 }],
    });
    expect(resultWithCanonicalAsOf.matchedUsers).toHaveLength(1);

    // With earlier asOf (2026-09-22): window [2026-09-15, 2026-09-22) → 0 events → no match
    const resultWithEarlierAsOf = await svc.previewAudience({
      name: 'test',
      asOf: WIN_7D_START, // = 2026-09-22T00:00:00.000Z
      conditions: [{ eventType: 'product_view', operator: 'at_least', count: 2, withinDays: 7 }],
    });
    expect(resultWithEarlierAsOf.matchedUsers).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 9. Canonical scenario against seeded DB
// ---------------------------------------------------------------------------

describe('Canonical scenario: product_view >= 2 AND purchase = 0 (7-day window)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
    seedDatabase(db);
  });
  afterEach(() => db.close());

  it('returns exactly the expected matching users from the seed dataset', async () => {
    const svc = makeService(db);
    const result = await svc.previewAudience(CANONICAL_REQUEST);

    // From independent inspection of seed fixtures:
    // Matches: anon_match_a (3 views, 0 purchases), anon_match_b (2 views, purchase before window),
    //          anon_threshold_exact (2 views, 0 purchases), anon_boundary_lower (2 views, 0 purchases),
    //          anon_boundary_upper (2 views, 0 purchases)
    // Non-matches:
    //   anon_nomatch_count (1 view)
    //   anon_nomatch_purchase (2 views + 1 purchase in window)
    //   anon_no_events (0 views, fails at_least:2)
    //   anon_outside_window (0 views in window)
    //   anon_future_events (0 views in window)
    //   anon_multi_window (1 view in 7d window)
    //   anon_purchase_only (0 views)
    const EXPECTED_MATCHES = new Set([
      'anon_match_a',
      'anon_match_b',
      'anon_threshold_exact',
      'anon_boundary_lower',
      'anon_boundary_upper',
    ]);

    expect(result.totalMatchedUsers).toBe(EXPECTED_MATCHES.size);
    const returnedIds = new Set(result.matchedUsers.map((u) => u.userId));
    for (const expected of EXPECTED_MATCHES) {
      expect(returnedIds).toContain(expected);
    }

    // Verify none of the non-matching users appear
    const NON_MATCHES = [
      'anon_nomatch_count',
      'anon_nomatch_purchase',
      'anon_no_events',
      'anon_outside_window',
      'anon_future_events',
      'anon_multi_window',
      'anon_purchase_only',
    ];
    for (const nonMatch of NON_MATCHES) {
      expect(returnedIds).not.toContain(nonMatch);
    }
  });

  it('anon_match_a evidence shows actualCount=3 for product_view condition', async () => {
    const svc = makeService(db);
    const result = await svc.previewAudience(CANONICAL_REQUEST);

    const matchA = result.matchedUsers.find((u) => u.userId === 'anon_match_a');
    expect(matchA).toBeDefined();

    const pvEvidence = matchA!.evidence.find((e) => e.eventType === 'product_view');
    expect(pvEvidence!.actualCount).toBe(3);
    expect(pvEvidence!.targetCount).toBe(2);
    expect(pvEvidence!.operator).toBe('at_least');
    expect(pvEvidence!.windowStart).toBe(WIN_7D_START);
    expect(pvEvidence!.windowEnd).toBe(AS_OF);
  });

  it('anon_match_b evidence shows purchase actualCount=0 (purchase was before window)', async () => {
    const svc = makeService(db);
    const result = await svc.previewAudience(CANONICAL_REQUEST);

    const matchB = result.matchedUsers.find((u) => u.userId === 'anon_match_b');
    expect(matchB).toBeDefined();

    const purchaseEv = matchB!.evidence.find((e) => e.eventType === 'purchase');
    expect(purchaseEv!.actualCount).toBe(0);
    expect(purchaseEv!.targetCount).toBe(0);
  });
});
