/**
 * HTTP Integration Tests for POST /v1/audiences/preview and GET /health.
 *
 * Strategy:
 *   - createApp() is extended to accept an optional Database so tests can
 *     inject an isolated in-memory DB seeded with known fixtures.
 *   - The development seed DB is never touched.
 *   - All expected outcomes are independently calculated from the fixture data.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createApp } from '../../src/app';
import { createInMemoryDb } from '../../src/db/connection';
import { initializeSchema } from '../../src/db/schema';
import { seedDatabase } from '../../src/db/seed';

// ---------------------------------------------------------------------------
// Test DB setup
// ---------------------------------------------------------------------------

let testDb: Database.Database;
let seededApp: ReturnType<typeof createApp>;
let bareApp: ReturnType<typeof createApp>;

beforeAll(() => {
  // Seeded DB — same fixtures as the dev DB but isolated in-memory
  testDb = createInMemoryDb();
  initializeSchema(testDb);
  seedDatabase(testDb);
  seededApp = createApp(testDb);

  // Bare DB — schema only, no data; used for empty-audience and error tests
  const bareDb = createInMemoryDb();
  initializeSchema(bareDb);
  bareApp = createApp(bareDb);
});

afterAll(() => {
  testDb?.close();
});

// ---------------------------------------------------------------------------
// 1. Health endpoint
// ---------------------------------------------------------------------------

describe('GET /health', () => {
  it('returns 200 with status ok and timestamp', async () => {
    const res = await request(seededApp).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('timestamp');
    // timestamp should be a parseable ISO string
    expect(() => new Date(res.body.timestamp as string)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 2. Successful preview — canonical audience with known expected matches
// ---------------------------------------------------------------------------

describe('POST /v1/audiences/preview — successful responses', () => {
  const CANONICAL_PAYLOAD = {
    name: 'Viewed but not purchased',
    asOf: '2026-09-29T00:00:00.000Z',
    conditions: [
      { eventType: 'product_view', operator: 'at_least', count: 2, withinDays: 7 },
      { eventType: 'purchase',     operator: 'exactly',  count: 0, withinDays: 7 },
    ],
  };

  it('returns 200 with correct response shape', async () => {
    const res = await request(seededApp)
      .post('/v1/audiences/preview')
      .send(CANONICAL_PAYLOAD)
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: 'Viewed but not purchased',
      asOf: '2026-09-29T00:00:00.000Z',
      totalMatchedUsers: expect.any(Number),
      matchedAnonymousUsers: expect.any(Number),
      matchedUsers: expect.any(Array),
    });
  });

  it('returns exactly 5 matched users for the canonical audience', async () => {
    // Independently derived from seed fixture inspection:
    //   anon_match_a         3 product_views, 0 purchases in window  ✅
    //   anon_match_b         2 product_views, purchase before window  ✅
    //   anon_threshold_exact 2 product_views, 0 purchases             ✅
    //   anon_boundary_lower  2 product_views (one at windowStart)     ✅
    //   anon_boundary_upper  2 product_views (one 1 ms before asOf)   ✅
    const res = await request(seededApp)
      .post('/v1/audiences/preview')
      .send(CANONICAL_PAYLOAD)
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.totalMatchedUsers).toBe(5);
    expect(res.body.matchedAnonymousUsers).toBe(5);
    expect(res.body.matchedUsers).toHaveLength(5);

    const matchedIds = (res.body.matchedUsers as Array<{ userId: string }>).map((u) => u.userId);
    expect(matchedIds).toContain('anon_match_a');
    expect(matchedIds).toContain('anon_match_b');
    expect(matchedIds).toContain('anon_threshold_exact');
    expect(matchedIds).toContain('anon_boundary_lower');
    expect(matchedIds).toContain('anon_boundary_upper');
  });

  it('totalMatchedUsers equals matchedUsers.length', async () => {
    const res = await request(seededApp)
      .post('/v1/audiences/preview')
      .send(CANONICAL_PAYLOAD)
      .set('Content-Type', 'application/json');

    expect(res.body.totalMatchedUsers).toBe(
      (res.body.matchedUsers as unknown[]).length
    );
  });

  it('each matched user has evidence array with one entry per condition', async () => {
    const res = await request(seededApp)
      .post('/v1/audiences/preview')
      .send(CANONICAL_PAYLOAD)
      .set('Content-Type', 'application/json');

    for (const user of res.body.matchedUsers as Array<{ evidence: unknown[] }>) {
      expect(user.evidence).toHaveLength(2); // two conditions
    }
  });

  it('evidence contains correct windowStart, windowEnd and operator', async () => {
    const res = await request(seededApp)
      .post('/v1/audiences/preview')
      .send(CANONICAL_PAYLOAD)
      .set('Content-Type', 'application/json');

    const firstUser = res.body.matchedUsers[0] as {
      evidence: Array<{
        eventType: string;
        operator: string;
        windowStart: string;
        windowEnd: string;
        withinDays: number;
        actualCount: number;
        targetCount: number;
      }>;
    };

    const pvEvidence = firstUser.evidence.find((e) => e.eventType === 'product_view');
    expect(pvEvidence).toBeDefined();
    // windowStart = asOf - 7d = 2026-09-22T00:00:00.000Z (independently calculated)
    expect(pvEvidence!.windowStart).toBe('2026-09-22T00:00:00.000Z');
    expect(pvEvidence!.windowEnd).toBe('2026-09-29T00:00:00.000Z');
    expect(pvEvidence!.operator).toBe('at_least');
    expect(pvEvidence!.targetCount).toBe(2);
    expect(pvEvidence!.withinDays).toBe(7);
  });

  it('returns empty audience when no users satisfy conditions', async () => {
    const res = await request(bareApp)
      .post('/v1/audiences/preview')
      .send(CANONICAL_PAYLOAD)
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.totalMatchedUsers).toBe(0);
    expect(res.body.matchedAnonymousUsers).toBe(0);
    expect(res.body.matchedUsers).toHaveLength(0);
  });

  it('correctly evaluates exactly:0 (zero-purchase condition)', async () => {
    // anon_nomatch_purchase has a purchase in the window — should NOT appear
    const res = await request(seededApp)
      .post('/v1/audiences/preview')
      .send(CANONICAL_PAYLOAD)
      .set('Content-Type', 'application/json');

    const matchedIds = (res.body.matchedUsers as Array<{ userId: string }>).map((u) => u.userId);
    expect(matchedIds).not.toContain('anon_nomatch_purchase');
  });

  it('correctly excludes users with events only outside the window', async () => {
    const res = await request(seededApp)
      .post('/v1/audiences/preview')
      .send(CANONICAL_PAYLOAD)
      .set('Content-Type', 'application/json');

    const matchedIds = (res.body.matchedUsers as Array<{ userId: string }>).map((u) => u.userId);
    expect(matchedIds).not.toContain('anon_outside_window');
    expect(matchedIds).not.toContain('anon_future_events');
  });
});

// ---------------------------------------------------------------------------
// 3. Validation errors — 400 responses
// ---------------------------------------------------------------------------

describe('POST /v1/audiences/preview — validation errors', () => {
  it('returns 400 with VALIDATION_ERROR for invalid event type', async () => {
    const res = await request(seededApp)
      .post('/v1/audiences/preview')
      .send({
        name: 'test',
        asOf: '2026-09-29T00:00:00.000Z',
        conditions: [{ eventType: 'item_clicked', operator: 'at_least', count: 1, withinDays: 7 }],
      })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toBe('Invalid request payload');
    expect(Array.isArray(res.body.error.details)).toBe(true);
    expect(res.body.error.details.length).toBeGreaterThan(0);
  });

  it('returns 400 with VALIDATION_ERROR for invalid operator', async () => {
    const res = await request(seededApp)
      .post('/v1/audiences/preview')
      .send({
        name: 'test',
        asOf: '2026-09-29T00:00:00.000Z',
        conditions: [{ eventType: 'product_view', operator: 'less_than', count: 1, withinDays: 7 }],
      })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for negative count', async () => {
    const res = await request(seededApp)
      .post('/v1/audiences/preview')
      .send({
        name: 'test',
        asOf: '2026-09-29T00:00:00.000Z',
        conditions: [{ eventType: 'product_view', operator: 'at_least', count: -1, withinDays: 7 }],
      })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for non-integer count', async () => {
    const res = await request(seededApp)
      .post('/v1/audiences/preview')
      .send({
        name: 'test',
        asOf: '2026-09-29T00:00:00.000Z',
        conditions: [{ eventType: 'product_view', operator: 'at_least', count: 1.5, withinDays: 7 }],
      })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for non-positive withinDays', async () => {
    const res = await request(seededApp)
      .post('/v1/audiences/preview')
      .send({
        name: 'test',
        asOf: '2026-09-29T00:00:00.000Z',
        conditions: [{ eventType: 'product_view', operator: 'at_least', count: 1, withinDays: 0 }],
      })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for missing asOf', async () => {
    const res = await request(seededApp)
      .post('/v1/audiences/preview')
      .send({
        name: 'test',
        conditions: [{ eventType: 'product_view', operator: 'at_least', count: 1, withinDays: 7 }],
      })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid asOf format', async () => {
    const res = await request(seededApp)
      .post('/v1/audiences/preview')
      .send({
        name: 'test',
        asOf: 'not-a-date',
        conditions: [{ eventType: 'product_view', operator: 'at_least', count: 1, withinDays: 7 }],
      })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for empty conditions array', async () => {
    const res = await request(seededApp)
      .post('/v1/audiences/preview')
      .send({ name: 'test', asOf: '2026-09-29T00:00:00.000Z', conditions: [] })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for empty audience name', async () => {
    const res = await request(seededApp)
      .post('/v1/audiences/preview')
      .send({
        name: '',
        asOf: '2026-09-29T00:00:00.000Z',
        conditions: [{ eventType: 'product_view', operator: 'at_least', count: 1, withinDays: 7 }],
      })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for malformed JSON body', async () => {
    const res = await request(seededApp)
      .post('/v1/audiences/preview')
      .send('{ invalid json !!!')
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
    expect(res.body.error.message).toBe('Malformed JSON payload in request body');
  });
});

// ---------------------------------------------------------------------------
// 4. Error response structure consistency
// ---------------------------------------------------------------------------

describe('Error response structure', () => {
  it('all validation errors have a consistent error envelope', async () => {
    const payloads = [
      { name: '', asOf: '2026-09-29T00:00:00.000Z', conditions: [{ eventType: 'product_view', operator: 'at_least', count: 1, withinDays: 7 }] },
      { name: 'test', asOf: 'bad', conditions: [{ eventType: 'product_view', operator: 'at_least', count: 1, withinDays: 7 }] },
      { name: 'test', asOf: '2026-09-29T00:00:00.000Z', conditions: [] },
    ];

    for (const payload of payloads) {
      const res = await request(seededApp)
        .post('/v1/audiences/preview')
        .send(payload)
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toHaveProperty('code');
      expect(res.body.error).toHaveProperty('message');
      // Should not expose stack traces or SQL
      expect(JSON.stringify(res.body)).not.toContain('SELECT');
      expect(JSON.stringify(res.body)).not.toContain('stack');
    }
  });
});

// ---------------------------------------------------------------------------
// 5. 404 handler
// ---------------------------------------------------------------------------

describe('404 handler', () => {
  it('returns 404 with NOT_FOUND code for unknown routes', async () => {
    const res = await request(seededApp).get('/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.message).toBe('Cannot GET /v1/does-not-exist');
  });
});
