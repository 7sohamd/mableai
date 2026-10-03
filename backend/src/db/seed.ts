import Database from 'better-sqlite3';

/**
 * Reference timestamp for all seed scenarios.
 * Matches the assignment's canonical example asOf date.
 *   asOf = 2026-09-29T00:00:00.000Z
 *
 * Window boundaries for the canonical query (7-day window):
 *   windowStart = asOf - 7 days = 2026-09-22T00:00:00.000Z  (inclusive)
 *   windowEnd   = asOf          = 2026-09-29T00:00:00.000Z  (exclusive, i.e. occurred_at < asOf)
 *
 * Timestamp convention:
 *   All occurred_at values are stored as ISO 8601 UTC strings:
 *     "YYYY-MM-DDTHH:MM:SS.sssZ"
 *   SQLite TEXT comparisons on this format are lexicographically correct for
 *   chronological ordering because the format is zero-padded and fixed-width.
 *
 * ---------------------------------------------------------------------------
 * Seed Scenarios (canonical audience: product_view >= 2 AND purchase = 0
 *                 within a 7-day window ending at asOf)
 * ---------------------------------------------------------------------------
 *
 *  ID | anonymous_id         | Scenario
 * ----|----------------------|------------------------------------------------
 *   1 | anon_match_a         | MATCHES: 3 product_views in window, 0 purchases
 *   2 | anon_match_b         | MATCHES: exactly 2 product_views, 0 purchases
 *   3 | anon_nomatch_count   | FAILS count: only 1 product_view in window
 *   4 | anon_nomatch_purchase| FAILS zero-purchase: has purchase in window
 *   5 | anon_no_events       | No events at all
 *   6 | anon_threshold_exact | product_views exactly at threshold (count = 2)
 *   7 | anon_boundary_lower  | product_view AT lower boundary (windowStart exactly)
 *   8 | anon_boundary_upper  | product_view AT upper boundary (1 ms before asOf)
 *   9 | anon_outside_window  | product_views exist but ALL before windowStart
 *  10 | anon_future_events   | product_views all AFTER asOf (future-dated)
 *  11 | anon_multi_window    | product_view >= 2 in 30d but < 2 in 7d (different window demo)
 *  12 | anon_purchase_only   | Only purchases, no product_views
 */

// ---------------------------------------------------------------------------
// Fixed timestamps (all UTC)
// ---------------------------------------------------------------------------
const AS_OF = '2026-09-29T00:00:00.000Z';       // evaluation cutoff
const WIN_START_7D = '2026-09-22T00:00:00.000Z'; // asOf - 7 days (lower boundary, inclusive)
const WIN_START_30D = '2026-08-30T00:00:00.000Z'; // asOf - 30 days

// Events firmly inside the 7-day window
const IN_WINDOW_1 = '2026-09-23T08:00:00.000Z';
const IN_WINDOW_2 = '2026-09-25T14:30:00.000Z';
const IN_WINDOW_3 = '2026-09-27T11:00:00.000Z';

// Event at the exact lower boundary (included when query is occurred_at >= windowStart)
const AT_LOWER_BOUNDARY = '2026-09-22T00:00:00.000Z'; // == WIN_START_7D, so INCLUDED

// Event 1 ms before the evaluation cutoff (still inside window)
const AT_UPPER_BOUNDARY = '2026-09-28T23:59:59.999Z'; // < AS_OF, so INCLUDED

// Events clearly outside the 7-day window but still before asOf
const BEFORE_WINDOW = '2026-09-21T23:59:59.999Z';      // 1 ms before windowStart
const WELL_BEFORE_WINDOW = '2026-09-15T12:00:00.000Z'; // well outside

// Events inside the 30-day but outside the 7-day window
const IN_30D_ONLY_1 = '2026-09-10T09:00:00.000Z'; // in 30d window, outside 7d window
const IN_30D_ONLY_2 = '2026-09-05T17:00:00.000Z';

// Future-dated events (after asOf)
const FUTURE_1 = '2026-09-30T08:00:00.000Z';
const FUTURE_2 = '2026-10-02T12:00:00.000Z';

// ---------------------------------------------------------------------------
// Seed fixtures
// ---------------------------------------------------------------------------

interface UserFixture {
  anonymous_id: string;
  events: Array<{ event_type: string; occurred_at: string }>;
}

const USER_FIXTURES: UserFixture[] = [
  // --- Scenario 1: MATCHES canonical audience ---
  {
    anonymous_id: 'anon_match_a',
    events: [
      { event_type: 'product_view', occurred_at: IN_WINDOW_1 },
      { event_type: 'product_view', occurred_at: IN_WINDOW_2 },
      { event_type: 'product_view', occurred_at: IN_WINDOW_3 },
      { event_type: 'page_view',    occurred_at: IN_WINDOW_1 }, // irrelevant event
    ],
  },
  // --- Scenario 2: MATCHES with exactly 2 product_views ---
  {
    anonymous_id: 'anon_match_b',
    events: [
      { event_type: 'product_view',  occurred_at: IN_WINDOW_1 },
      { event_type: 'product_view',  occurred_at: IN_WINDOW_3 },
      { event_type: 'add_to_cart',   occurred_at: IN_WINDOW_2 },
      // purchase OUTSIDE the 7-day window — should not disqualify
      { event_type: 'purchase',      occurred_at: WELL_BEFORE_WINDOW },
    ],
  },
  // --- Scenario 3: FAILS minimum product_view count (only 1 in window) ---
  {
    anonymous_id: 'anon_nomatch_count',
    events: [
      { event_type: 'product_view',  occurred_at: IN_WINDOW_2 },
      { event_type: 'product_view',  occurred_at: BEFORE_WINDOW }, // outside window
      { event_type: 'page_view',     occurred_at: IN_WINDOW_1 },
    ],
  },
  // --- Scenario 4: FAILS zero-purchase requirement (has purchase in window) ---
  {
    anonymous_id: 'anon_nomatch_purchase',
    events: [
      { event_type: 'product_view',       occurred_at: IN_WINDOW_1 },
      { event_type: 'product_view',       occurred_at: IN_WINDOW_2 },
      { event_type: 'checkout_started',   occurred_at: IN_WINDOW_2 },
      { event_type: 'purchase',           occurred_at: IN_WINDOW_3 }, // disqualifies
    ],
  },
  // --- Scenario 5: No events at all ---
  {
    anonymous_id: 'anon_no_events',
    events: [],
  },
  // --- Scenario 6: Event count exactly at threshold (duplicate of match_b for clarity) ---
  {
    anonymous_id: 'anon_threshold_exact',
    events: [
      { event_type: 'product_view', occurred_at: IN_WINDOW_1 },
      { event_type: 'product_view', occurred_at: IN_WINDOW_2 },
      // count == 2, exactly meets at_least:2
    ],
  },
  // --- Scenario 7: product_view AT exact lower boundary (windowStart) ---
  {
    anonymous_id: 'anon_boundary_lower',
    events: [
      { event_type: 'product_view', occurred_at: AT_LOWER_BOUNDARY }, // included
      { event_type: 'product_view', occurred_at: IN_WINDOW_2 },
    ],
  },
  // --- Scenario 8: product_view AT upper boundary (1 ms before asOf) ---
  {
    anonymous_id: 'anon_boundary_upper',
    events: [
      { event_type: 'product_view', occurred_at: IN_WINDOW_1 },
      { event_type: 'product_view', occurred_at: AT_UPPER_BOUNDARY }, // included (< asOf)
    ],
  },
  // --- Scenario 9: product_views exist but ALL outside the window ---
  {
    anonymous_id: 'anon_outside_window',
    events: [
      { event_type: 'product_view', occurred_at: BEFORE_WINDOW },      // 1 ms too early
      { event_type: 'product_view', occurred_at: WELL_BEFORE_WINDOW },
      { event_type: 'product_view', occurred_at: WELL_BEFORE_WINDOW },
    ],
  },
  // --- Scenario 10: Future-dated events (after asOf) ---
  {
    anonymous_id: 'anon_future_events',
    events: [
      { event_type: 'product_view', occurred_at: FUTURE_1 },
      { event_type: 'product_view', occurred_at: FUTURE_2 },
    ],
  },
  // --- Scenario 11: Multi-window demo (in 30d but NOT in 7d) ---
  {
    anonymous_id: 'anon_multi_window',
    events: [
      { event_type: 'product_view', occurred_at: IN_30D_ONLY_1 }, // in 30d, outside 7d
      { event_type: 'product_view', occurred_at: IN_30D_ONLY_2 }, // in 30d, outside 7d
      { event_type: 'product_view', occurred_at: IN_WINDOW_1 },   // in 7d (1 event, < 2)
    ],
  },
  // --- Scenario 12: Purchase-only user (no product_views) ---
  {
    anonymous_id: 'anon_purchase_only',
    events: [
      { event_type: 'purchase', occurred_at: IN_WINDOW_1 },
      { event_type: 'purchase', occurred_at: IN_WINDOW_2 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Exported constants for use in tests
// ---------------------------------------------------------------------------
export const SEED_AS_OF = AS_OF;
export const SEED_WIN_START_7D = WIN_START_7D;
export const SEED_WIN_START_30D = WIN_START_30D;
export const SEED_AT_LOWER_BOUNDARY = AT_LOWER_BOUNDARY;
export const SEED_AT_UPPER_BOUNDARY = AT_UPPER_BOUNDARY;
export const SEED_BEFORE_WINDOW = BEFORE_WINDOW;
export const SEED_IN_WINDOW_1 = IN_WINDOW_1;
export const SEED_IN_WINDOW_2 = IN_WINDOW_2;
export const SEED_IN_WINDOW_3 = IN_WINDOW_3;
export const SEED_FUTURE_1 = FUTURE_1;
export const SEED_USER_COUNT = USER_FIXTURES.length;
export const SEED_TOTAL_EVENTS = USER_FIXTURES.reduce((n, u) => n + u.events.length, 0);

// ---------------------------------------------------------------------------
// Seed execution
// ---------------------------------------------------------------------------

/**
 * Seeds the database with the deterministic fixture dataset.
 *
 * Idempotent: each anonymous_id is inserted via INSERT OR IGNORE, so re-running
 * never creates duplicate users.  Events are deleted and re-inserted for any
 * user that already exists so the fixture event set always reflects the
 * intended state (avoids duplicate events while remaining idempotent).
 *
 * Does NOT use random values or the server's current clock.
 */
export function seedDatabase(db: Database.Database): void {
  const insertUser = db.prepare<[string]>(
    'INSERT OR IGNORE INTO anonymous_users (anonymous_id) VALUES (?)'
  );
  const selectUserId = db.prepare<[string], { id: number }>(
    'SELECT id FROM anonymous_users WHERE anonymous_id = ?'
  );
  const deleteUserEvents = db.prepare<[number]>(
    'DELETE FROM events WHERE anonymous_user_id = ?'
  );
  const insertEvent = db.prepare<[number, string, string]>(
    'INSERT INTO events (anonymous_user_id, event_type, occurred_at) VALUES (?, ?, ?)'
  );

  const seedAll = db.transaction(() => {
    for (const fixture of USER_FIXTURES) {
      // Upsert the user (INSERT OR IGNORE preserves existing row's id).
      insertUser.run(fixture.anonymous_id);
      const row = selectUserId.get(fixture.anonymous_id);
      if (!row) {
        throw new Error(`Seed error: could not resolve id for "${fixture.anonymous_id}"`);
      }
      const userId = row.id;

      // Remove any pre-existing events for this user then re-insert.
      deleteUserEvents.run(userId);
      for (const event of fixture.events) {
        insertEvent.run(userId, event.event_type, event.occurred_at);
      }
    }
  });

  seedAll();
}
