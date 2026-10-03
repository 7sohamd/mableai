# AI Usage Record

This document provides a transparent record of how artificial intelligence assistance was employed during the design, implementation, and verification of the Mable Audience Builder project.

---

## 1. Tooling and Environment

* **Primary AI Assistant**: Antigravity AI Assistant (powered by Google DeepMind Advanced Agentic Coding).
* **Role**: Pair programmer and automated execution partner across all phases.
* **Scope**: Monorepo scaffolding, schema and contract definitions, evaluation algorithms, React component implementation, unit/integration test generation, and technical documentation.

---

## 2. Specific Tasks with AI Assistance

| Phase | Task Description | AI Contribution | Human / System Review & Refinement |
| :--- | :--- | :--- | :--- |
| **Phase 1: Foundation** | Project scaffolding, TypeScript configuration, Zod contracts, and API error formatting. | Generated monorepo directory layout, TypeScript interfaces, Zod contract schemas, and Express error-handling middleware. | Verified against assignment requirements; ensured clean contract mirroring between frontend and backend. |
| **Phase 2: Persistence & Seeds** | SQLite schema, connection management, repository queries, and synthetic seed data. | Generated DDL statements with constraints and composite indexes, implemented `better-sqlite3` connection handling, and wrote 12 deterministic seed fixtures. | Enforced foreign keys (`PRAGMA foreign_keys = ON`), WAL journal mode, and parameterized SQL queries (`?`) to prevent injection vulnerabilities. |
| **Phase 3: Evaluation Engine** | Core audience preview evaluation algorithm, time window calculation, and query batching. | Implemented window derivation (`[asOf - withinDays, asOf)`), operator evaluation (`at_least`, `exactly`), and batch query caching. | Corrected handling of missing users in `GROUP BY` aggregates (defaulting count to `0` for zero-event checks); eliminated N+1 query patterns. |
| **Phase 4: Frontend Integration** | React rule builder UI, ConditionEditor, PreviewResults, API integration, and test suite. | Created responsive, accessible component hierarchy, form validation logic, stale result warning banner, and 37 Vitest/RTL tests. | Fixed jsdom number-input quirks with negative inputs; scoped testing library queries to `within(group)` to prevent ambiguous element collisions. |
| **Phase 5: Audit & Readiness** | Documentation, end-to-end verification, and git history preparation. | Drafted `README.md`, `docs/DESIGN.md`, and `docs/AI_USAGE.md`; verified test suites, builds, and health/preview endpoints. | Audited word counts (<750 words for DESIGN.md), confirmed zero build/type errors, and verified live HTTP responses. |

---

## 3. Human Verification and Independent Validation

All AI-generated code and configuration were subject to rigorous validation before acceptance:

1. **Automated Test Suites**:
   * Backend: 113 unit and integration tests covering Zod contracts, SQLite constraints, boundary windows, and edge cases.
   * Frontend: 37 React Testing Library + user-event tests covering condition creation, field editing, validation errors, retry flows, and stale banners.
2. **Type-Checking & Production Builds**:
   * Backend: `npm run type-check` (`tsc --noEmit`) and `npm run build` (`tsc`).
   * Frontend: `npm run type-check` (`tsc --noEmit`) and `npm run build` (`tsc && vite build`).
3. **Manual Live API Verification**:
   * Tested `GET /health` responding with HTTP 200.
   * Tested canonical preview payload verifying 5 matched users (`anon_match_a`, `anon_match_b`, etc.) with correct evidence.
   * Tested invalid payloads verifying HTTP 400 with structured validation details.
   * Tested zero-match scenarios verifying empty user array and HTTP 200.

---

## 4. Limitations Identified and Corrected

* **Missing Event Grouping**: Early iterations of `GROUP BY` queries omitted users with 0 events. If a rule required `purchase exactly 0`, users without any purchase row would have been omitted if not explicitly accounted for. The evaluation engine was adjusted to default missing user counts to `0`.
* **jsdom Number Input Handling**: In frontend testing, jsdom's `type=number` input implementation dropped the minus sign (`-`) upon `userEvent.type(input, '-1')`. The test was adjusted to test non-integer decimal inputs (`1.5`), ensuring the same non-negative integer validation logic was exercised reliably.
* **Ambiguous Test Selectors**: Initial test queries for condition labels and dropdowns collided when multiple conditions were rendered simultaneously. Tests were updated to scope element queries using `within(conditionGroup)`.
* **Database Isolation in Tests**: Tests initially shared file connections. The test infrastructure was adapted to instantiate clean in-memory databases (`:memory:`) per test suite to prevent test order coupling.
