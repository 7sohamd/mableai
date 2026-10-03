import Database from 'better-sqlite3';
import { EventType } from '../contracts/audiencePreview';

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

/**
 * A row from the anonymous_users table, mapped to a typed domain object.
 * The repository returns this type so callers never depend on raw SQLite row shapes.
 */
export interface AnonymousUser {
  /** Internal integer primary key. */
  id: number;
  /** Opaque string identifier used for audience matching. */
  anonymousId: string;
}

/**
 * Aggregate result: how many events of a given type a user performed within
 * a specified time window.
 */
export interface EventCount {
  anonymousUserId: number;
  anonymousId: string;
  eventType: EventType;
  count: number;
}

/**
 * A typed representation of a single event row for callers that need raw events.
 */
export interface StoredEvent {
  id: number;
  anonymousUserId: number;
  anonymousId: string;
  eventType: EventType;
  occurredAt: string;
}

// ---------------------------------------------------------------------------
// Raw SQLite row shapes (private to this module)
// ---------------------------------------------------------------------------

interface RawUserRow {
  id: number;
  anonymous_id: string;
}

interface RawEventCountRow {
  anonymous_user_id: number;
  anonymous_id: string;
  event_count: number;
}

interface RawEventRow {
  id: number;
  anonymous_user_id: number;
  anonymous_id: string;
  event_type: string;
  occurred_at: string;
}

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

export interface IEventRepository {
  /**
   * Returns all anonymous users in insertion order.
   */
  getAllUsers(db: Database.Database): AnonymousUser[];

  /**
   * Returns event counts per user for a specific event type within the
   * half-open time interval [windowStart, windowEnd).
   *
   * The interval is:
   *   occurred_at >= windowStart  (inclusive lower boundary)
   *   occurred_at <  windowEnd    (exclusive upper boundary — typically asOf)
   *
   * Only users who have at least one matching event are included.
   *
   * @param db          - The active SQLite connection.
   * @param eventType   - The event type to aggregate.
   * @param windowStart - ISO 8601 UTC string for the inclusive lower boundary.
   * @param windowEnd   - ISO 8601 UTC string for the exclusive upper boundary.
   */
  getEventCounts(
    db: Database.Database,
    eventType: EventType,
    windowStart: string,
    windowEnd: string
  ): EventCount[];

  /**
   * Returns individual event rows for a single user + event type within the
   * half-open interval [windowStart, windowEnd).
   * Ordered by occurred_at ascending.
   *
   * @param db              - The active SQLite connection.
   * @param anonymousUserId - The internal integer user id.
   * @param eventType       - The event type to retrieve.
   * @param windowStart     - ISO 8601 UTC inclusive lower boundary.
   * @param windowEnd       - ISO 8601 UTC exclusive upper boundary.
   */
  getEventsForUser(
    db: Database.Database,
    anonymousUserId: number,
    eventType: EventType,
    windowStart: string,
    windowEnd: string
  ): StoredEvent[];
}

// ---------------------------------------------------------------------------
// SQLite implementation
// ---------------------------------------------------------------------------

/**
 * Stateless SQLite implementation of IEventRepository.
 *
 * Receives the Database connection as a parameter rather than owning it, which
 * makes the repository easy to use with both the application singleton connection
 * and with isolated in-memory databases in tests.
 *
 * All queries are parameterized — no string concatenation of user-supplied values.
 * No audience-matching or operator-evaluation logic lives here; those concerns
 * belong to the evaluator service.
 */
export class SqliteEventRepository implements IEventRepository {
  getAllUsers(db: Database.Database): AnonymousUser[] {
    const rows = db
      .prepare<[], RawUserRow>('SELECT id, anonymous_id FROM anonymous_users ORDER BY id')
      .all();

    return rows.map((r) => ({ id: r.id, anonymousId: r.anonymous_id }));
  }

  getEventCounts(
    db: Database.Database,
    eventType: EventType,
    windowStart: string,
    windowEnd: string
  ): EventCount[] {
    const rows = db
      .prepare<[string, string, string], RawEventCountRow>(
        `SELECT
           e.anonymous_user_id,
           u.anonymous_id,
           COUNT(*)        AS event_count
         FROM events e
         JOIN anonymous_users u ON u.id = e.anonymous_user_id
         WHERE e.event_type   = ?
           AND e.occurred_at >= ?
           AND e.occurred_at <  ?
         GROUP BY e.anonymous_user_id`
      )
      .all(eventType, windowStart, windowEnd);

    return rows.map((r) => ({
      anonymousUserId: r.anonymous_user_id,
      anonymousId: r.anonymous_id,
      eventType,
      count: r.event_count,
    }));
  }

  getEventsForUser(
    db: Database.Database,
    anonymousUserId: number,
    eventType: EventType,
    windowStart: string,
    windowEnd: string
  ): StoredEvent[] {
    const rows = db
      .prepare<[number, string, string, string], RawEventRow>(
        `SELECT
           e.id,
           e.anonymous_user_id,
           u.anonymous_id,
           e.event_type,
           e.occurred_at
         FROM events e
         JOIN anonymous_users u ON u.id = e.anonymous_user_id
         WHERE e.anonymous_user_id = ?
           AND e.event_type        = ?
           AND e.occurred_at      >= ?
           AND e.occurred_at       < ?
         ORDER BY e.occurred_at ASC`
      )
      .all(anonymousUserId, eventType, windowStart, windowEnd);

    return rows.map((r) => ({
      id: r.id,
      anonymousUserId: r.anonymous_user_id,
      anonymousId: r.anonymous_id,
      eventType: r.event_type as EventType,
      occurredAt: r.occurred_at,
    }));
  }
}

/**
 * Shared singleton instance.
 * The evaluator service and route layer obtain the DB connection via getDb()
 * and pass it into these methods, keeping the repository free of connection state.
 */
export const eventRepository = new SqliteEventRepository();
