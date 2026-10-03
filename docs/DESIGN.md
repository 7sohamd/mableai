# Mable Audience Builder: Design Document

## 1. Data Model and Schema

The application persists behavioral event data in SQLite (`better-sqlite3`) using a normalized two-table relational schema:

* **`anonymous_users`**:
  * `id`: Integer primary key (autoincrement).
  * `anonymous_id`: Unique non-null text identifier (e.g., `anon_match_a`).
* **`events`**:
  * `id`: Integer primary key (autoincrement).
  * `anonymous_user_id`: Foreign key referencing `anonymous_users(id)` (`ON DELETE CASCADE`).
  * `event_type`: Text with a `CHECK` constraint restricting values to `page_view`, `product_view`, `add_to_cart`, `checkout_started`, and `purchase`.
  * `occurred_at`: ISO 8601 UTC timestamp string (`YYYY-MM-DDTHH:MM:SS.sssZ`).

Indexes are established for single-column lookups (`anonymous_user_id`, `event_type`, `occurred_at`) and a composite index on `(anonymous_user_id, event_type, occurred_at)` to support fast windowed filtering.

## 2. Layer Responsibilities

* **Controller Layer (`controllers/audiencePreviewController.ts`)**: Decodes HTTP requests, executes Zod schema validation, and translates domain errors or results into the HTTP envelope.
* **Service Layer (`services/audienceEvaluationService.ts`)**: Encapsulates audience matching rules, computes condition time intervals, caches queries, evaluates boolean operators, and constructs condition evidence.
* **Repository Layer (`repositories/eventRepository.ts`)**: Manages SQLite queries using parameterized SQL (`?` placeholders). Returns domain models (`AnonymousUser`, `EventCount`) without exposing internal SQLite row structures.
* **Middleware (`middleware/errorHandler.ts`)**: Converts validation errors, application errors, and malformed JSON into a uniform `{ error: { code, message, details } }` format without exposing internal stack traces.

## 3. Audience Evaluation Algorithm

Evaluation proceeds in five steps:

1. **Window Derivation**: For each condition, the time window is computed from `asOf` and `withinDays`:
   $$\text{windowStart} = \text{asOf} - (\text{withinDays} \times 86{,}400{,}000\text{ ms})$$
   $$\text{windowEnd} = \text{asOf}$$
2. **Window Deduplication & Query Batching**: Unique `(eventType, windowStart, windowEnd)` triples are identified. For each unique triple, a single `GROUP BY` query aggregates counts per user.
3. **User Retrieval**: All registered anonymous users are loaded in one pass.
4. **Conjunctive Evaluation (AND Semantics)**: Each user is evaluated against every condition. If a user has no events for a given condition, their count defaults to `0`. A condition passes if the count satisfies its operator (`actual >= target` for `at_least`; `actual === target` for `exactly`). If any condition fails, the user is disqualified immediately (short-circuit).
5. **Evidence Construction**: For matching users, per-condition evidence is attached, including window boundaries, operator, target count, and actual observed count.

## 4. Time Window and Determinism

* **Half-Open Interval**: The time filter is strictly half-open: `[windowStart, windowEnd)`.
  * Lower bound: `occurred_at >= windowStart` (inclusive).
  * Upper bound: `occurred_at < windowEnd` (exclusive, where `windowEnd = asOf`).
* **Zero Clock Drift**: The server's wall-clock time is never referenced during evaluation. All boundaries derive deterministically from the user-provided `asOf` timestamp using UTC millisecond arithmetic.

## 5. Query Strategy and Performance Tradeoffs

Rather than executing queries per user ($O(U \times C)$), the repository aggregates events per unique condition window across all users ($O(C_{\text{unique}})$):

```sql
SELECT e.anonymous_user_id, u.anonymous_id, COUNT(*) AS event_count
FROM events e
JOIN anonymous_users u ON u.id = e.anonymous_user_id
WHERE e.event_type = ? AND e.occurred_at >= ? AND e.occurred_at < ?
GROUP BY e.anonymous_user_id
```

* **Tradeoff**: In-memory join in Node.js keeps database round-trips constant regardless of user base size, at the cost of loading active event counts into memory. For large-scale data, windowed CTEs or temporary tables can push the conjunctive filtering entirely into SQLite.

## 6. Key Design Decisions and Alternatives

* **Missing Event Counts**: Users with zero occurrences of an event type are omitted from SQL `GROUP BY` output. The service defaults missing user entries to `0`, ensuring conditions like `purchase exactly 0` correctly match inactive users.
* **Aggregate Evidence vs. Full Event Payloads**: The service populates `events: []` and returns aggregate numbers. Returning thousands of raw event rows would degrade payload size and network throughput.
* **Decoupled Frontend / Backend**: The React frontend interacts solely via HTTP (`POST /v1/audiences/preview`). No membership logic is duplicated in the browser.
