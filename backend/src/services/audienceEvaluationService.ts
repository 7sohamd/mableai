import Database from 'better-sqlite3';
import {
  AudienceCondition,
  AudiencePreviewRequest,
  AudiencePreviewResponse,
  ConditionEvidence,
  MatchedUser,
} from '../contracts/audiencePreview';
import { IEventRepository } from '../repositories/eventRepository';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface IAudienceEvaluationService {
  previewAudience(request: AudiencePreviewRequest): Promise<AudiencePreviewResponse>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Milliseconds in one day. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Computes the half-open window [windowStart, asOf) for a single condition.
 *
 * windowStart = asOf - withinDays * 24 hours  (inclusive)
 * windowEnd   = asOf                           (exclusive — asOf itself excluded)
 *
 * Uses integer millisecond arithmetic on the parsed asOf timestamp so the
 * result is deterministic regardless of the server's local timezone or DST.
 *
 * @returns ISO 8601 UTC strings for both window boundaries.
 */
function computeWindow(asOf: string, withinDays: number): { windowStart: string; windowEnd: string } {
  const asOfMs = new Date(asOf).getTime();
  const windowStartMs = asOfMs - withinDays * MS_PER_DAY;
  return {
    windowStart: new Date(windowStartMs).toISOString(),
    windowEnd: asOf, // asOf is the exclusive upper boundary
  };
}

/**
 * Returns a cache key for a (eventType, windowStart, windowEnd) triple so that
 * two conditions with the same event type but different windows each get their
 * own query, and two conditions that share event type AND window share one query.
 */
function countCacheKey(eventType: string, windowStart: string, windowEnd: string): string {
  return `${eventType}|${windowStart}|${windowEnd}`;
}

/**
 * Evaluates whether a single condition's count satisfies its operator.
 *
 * at_least: actualCount >= targetCount
 * exactly:  actualCount === targetCount
 *
 * A missing user entry in the event-count map is treated as actualCount = 0,
 * which correctly handles `exactly: 0` for users with no events.
 */
function evaluateOperator(
  operator: AudienceCondition['operator'],
  actualCount: number,
  targetCount: number
): boolean {
  switch (operator) {
    case 'at_least':
      return actualCount >= targetCount;
    case 'exactly':
      return actualCount === targetCount;
  }
}

// ---------------------------------------------------------------------------
// Service implementation
// ---------------------------------------------------------------------------

/**
 * AudienceEvaluationService
 *
 * Evaluation algorithm:
 *
 * 1. For each condition, compute its time window from asOf + withinDays.
 * 2. Deduplicate (eventType, windowStart, windowEnd) triples and issue one
 *    `getEventCounts` SQL query per unique triple. Results are stored in a
 *    Map keyed by (cacheKey -> Map<anonymousId, count>).
 * 3. Retrieve all anonymous users (one query).
 * 4. Iterate every user. For each condition, look up the user's count in the
 *    map (defaulting to 0 when absent). Evaluate the operator. A user matches
 *    only when ALL conditions pass (AND semantics).
 * 5. Build the response: matched users with per-condition aggregate evidence.
 *    Individual event rows are NOT fetched; the contract's `events` array is
 *    populated as `[]` since the spec prefers aggregate evidence.
 *
 * This issues at most (unique condition windows + 1) SQL queries regardless
 * of the number of users — not one query per user.
 *
 * The server clock is never consulted. All time arithmetic derives from the
 * request's `asOf` field.
 */
export class AudienceEvaluationService implements IAudienceEvaluationService {
  constructor(
    private readonly eventRepository: IEventRepository,
    private readonly db: Database.Database
  ) {}

  async previewAudience(request: AudiencePreviewRequest): Promise<AudiencePreviewResponse> {
    const { name, asOf, conditions } = request;

    // ── Step 1: compute windows for every condition ──────────────────────────
    const conditionWindows = conditions.map((cond) => ({
      cond,
      ...computeWindow(asOf, cond.withinDays),
    }));

    // ── Step 2: issue one SQL query per unique (type, window) triple ─────────
    // Map<cacheKey, Map<anonymousId, count>>
    const countCache = new Map<string, Map<string, number>>();

    for (const { cond, windowStart, windowEnd } of conditionWindows) {
      const key = countCacheKey(cond.eventType, windowStart, windowEnd);
      if (countCache.has(key)) continue; // already fetched

      const rows = this.eventRepository.getEventCounts(
        this.db,
        cond.eventType,
        windowStart,
        windowEnd
      );

      const byUser = new Map<string, number>();
      for (const row of rows) {
        byUser.set(row.anonymousId, row.count);
      }
      countCache.set(key, byUser);
    }

    // ── Step 3: fetch all users ───────────────────────────────────────────────
    const allUsers = this.eventRepository.getAllUsers(this.db);

    // ── Step 4 & 5: evaluate each user against all conditions ─────────────────
    const matchedUsers: MatchedUser[] = [];

    for (const user of allUsers) {
      let allConditionsMet = true;
      const evidence: ConditionEvidence[] = [];

      for (let i = 0; i < conditionWindows.length; i++) {
        const { cond, windowStart, windowEnd } = conditionWindows[i];
        const key = countCacheKey(cond.eventType, windowStart, windowEnd);
        const byUser = countCache.get(key)!;
        const actualCount = byUser.get(user.anonymousId) ?? 0;
        const conditionMet = evaluateOperator(cond.operator, actualCount, cond.count);

        if (!conditionMet) {
          allConditionsMet = false;
          // We still need to build evidence for all conditions if the user matches;
          // but since this user won't match, short-circuit (evidence not needed).
          break;
        }

        evidence.push({
          conditionIndex: i,
          conditionId: cond.id,
          eventType: cond.eventType,
          operator: cond.operator,
          targetCount: cond.count,
          actualCount,
          withinDays: cond.withinDays,
          windowStart,
          windowEnd,
          events: [], // aggregate evidence; individual records not required
        });
      }

      if (allConditionsMet) {
        matchedUsers.push({
          userId: user.anonymousId,
          isAnonymous: true,
          evidence,
        });
      }
    }

    return {
      name,
      asOf,
      totalMatchedUsers: matchedUsers.length,
      matchedAnonymousUsers: matchedUsers.length,
      matchedUsers,
    };
  }
}
