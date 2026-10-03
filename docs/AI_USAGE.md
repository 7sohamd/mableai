# AI Usage Record

This document provides a transparent record of how artificial intelligence tools were employed during the design, implementation, and verification of the Mable Audience Builder project.

Core domain logic, database schema design, and backend evaluation engine algorithms were engineered directly; AI tooling was selectively leveraged for frontend generation, automated test suite creation, and documentation.

---

## 1. Tooling and AI Allocation

The use of AI was strictly scoped to specific tools and project components:

* **Anthropic Claude**: Employed for frontend development, generating the React UI component tree, condition builder interface, preview tables, and UI state flows.
* **Antigravity AI IDE**: Employed for generating automated testing suites and test cases across both backend and frontend (unit tests, integration tests, boundary condition coverage, and RTL component tests).
* **OpenAI ChatGPT**: Employed for Phase 5 tasks and developing the markdown documentation, including `docs/DESIGN.md`, `docs/AI_USAGE.md`, and `README.md`.

---

## 2. Tasks with AI Assistance

| Phase / Focus Area | Scope & AI Contribution | Tool Employed | Human Review & Refinement |
| :--- | :--- | :--- | :--- |
| **Frontend Implementation** | Generated React component hierarchy (`ConditionEditor`, `PreviewResults`, rule builder layout), state handling, and UI interactions. | **Claude** | Verified styling consistency, ensured adherence to contract definitions, and refined accessibility and responsive layout. |
| **Testing & Quality Assurance** | Generated comprehensive test suites and test cases covering Zod contracts, window boundaries, SQLite constraints, and UI interactions (113 backend tests, 37 frontend tests). | **Antigravity AI IDE** | Corrected edge-case assertions, resolved jsdom input simulation quirks, and ensured in-memory database test isolation. |
| **Phase 5: Documentation & Readiness** | Drafted and formatted project markdown documentation: `DESIGN.md`, `AI_USAGE.md`, and `README.md`. | **ChatGPT** | Audited for architectural fidelity, strictly enforced length constraints (<750 words for `DESIGN.md`), and ensured full alignment with the codebase. |

---

## 3. Human Verification and Independent Validation

All AI-generated artifacts were rigorously inspected, validated, and verified:

1. **Automated Test Execution**:
   * Backend: Ran 113 unit and integration tests across contracts, persistence constraints, and evaluation logic.
   * Frontend: Ran 37 Vitest + React Testing Library tests covering user events, validation states, and stale banner behavior.
2. **Type-Checking & Production Builds**:
   * Backend: `npm run type-check` (`tsc --noEmit`) and `npm run build` (`tsc`).
   * Frontend: `npm run type-check` (`tsc --noEmit`) and `npm run build` (`tsc && vite build`).
3. **End-to-End Verification**:
   * Verified live HTTP responses (`/health`, `/api/preview`) against the evaluation engine.
   * Tested edge cases: zero-event checks, boundary timestamps, invalid payloads (HTTP 400), and large seed queries.

---

## 4. Limitations Identified and Refined

* **Frontend Input Handling**: Claude-generated form components initially allowed subtle input inconsistencies in numeric fields; refined validation and event handling to ensure strict non-negative integer enforcement.
* **Test Isolation & Selectors**: Antigravity AI IDE-generated component tests initially had ambiguous query selectors when multiple condition rows rendered; refined tests to use `within(group)` scopes and isolated in-memory test databases.
* **Documentation Conciseness**: ChatGPT initial drafts for `DESIGN.md` exceeded the 750-word constraint; iteratively edited down to retain high-density technical trade-offs while staying within limits.
