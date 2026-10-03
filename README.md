# Mable Audience Builder

Mable Audience Builder is an audience segmentation engine and interactive builder. It allows marketing and product teams to evaluate behavioral event criteria (such as product views, cart additions, and purchases) within defined historical time windows relative to an arbitrary cutoff timestamp (`asOf`).

The repository is organized as an independently runnable TypeScript monorepo with an Express backend powered by SQLite (`better-sqlite3`) and an accessible React frontend built with Vite.

---

## 1. Project Architecture & Structure

```text
mable-audience-builder/
├── backend/                       # Node.js + Express + TypeScript API
│   ├── src/
│   │   ├── config/                # Environment variables (port, db path, CORS)
│   │   ├── contracts/             # Zod validation schemas & TypeScript types
│   │   ├── controllers/           # HTTP controllers (request parsing & validation)
│   │   ├── db/                    # SQLite connection, schema DDL, and seed fixtures
│   │   ├── middleware/            # Error handler (ApiErrorResponse) & 404 handler
│   │   ├── repositories/          # Parameterized SQLite event repository
│   │   ├── routes/                # Express routes (/health, /v1/audiences)
│   │   ├── scripts/               # CLI script for db init and seeding
│   │   ├── services/              # Deterministic audience evaluation engine
│   │   ├── app.ts                 # Express application factory
│   │   └── server.ts              # HTTP server entrypoint & graceful shutdown
│   ├── tests/
│   │   ├── integration/           # Supertest HTTP integration tests
│   │   └── unit/                  # Zod contracts, database, and evaluation service tests
│   ├── .env.example               # Backend environment template
│   ├── package.json
│   └── tsconfig.json
├── frontend/                      # React 18 + Vite + TypeScript application
│   ├── src/
│   │   ├── api/                   # Typed API client for audience preview
│   │   ├── components/            # ConditionEditor and PreviewResults components
│   │   ├── config/                # Environment config (VITE_API_BASE_URL)
│   │   ├── contracts/             # Shared TypeScript request/response contracts
│   │   ├── test/                  # Vitest + React Testing Library integration tests
│   │   ├── App.module.css         # Component styling
│   │   ├── App.tsx                # Main audience builder page & state orchestration
│   │   ├── index.css              # Design tokens and base styles
│   │   └── main.tsx               # React application entrypoint
│   ├── index.html
│   ├── .env.example               # Frontend environment template
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── docs/
│   ├── DESIGN.md                  # System architecture, data model, and evaluation algorithm
│   └── AI_USAGE.md                # Record of AI tool usage, human verification, and corrections
├── README.md                      # Project documentation and reproduction guide
└── package.json                   # Monorepo orchestration scripts
```

---

## 2. Prerequisites & Runtime Versions

* **Node.js**: `>= 18.0.0` (tested on Node `v22.14.0`)
* **npm**: `>= 9.0.0` (tested on npm `v11.4.2`)

---

## 3. Installation

Install all dependencies across the monorepo from the root:

```bash
npm install
```

Alternatively, install dependencies inside each application independently:

```bash
# Frontend
cd frontend
npm install

# Backend
cd ../backend
npm install
```

---

## 4. Environment Configuration

Copy the example environment files:

```bash
# Backend configuration
cp backend/.env.example backend/.env

# Frontend configuration
cp frontend/.env.example frontend/.env
```

Default settings:
* **Backend** (`backend/.env`):
  ```env
  PORT=4000
  NODE_ENV=development
  DATABASE_PATH=./data/mable.db
  CORS_ORIGIN=http://localhost:5173
  ```
* **Frontend** (`frontend/.env`):
  ```env
  VITE_API_BASE_URL=http://localhost:4000
  ```

---

## 5. Database Initialization & Seeding

The SQLite database must be initialized with the schema and test fixtures prior to evaluation.

From the repository root:

```bash
# Initialize schema and load deterministic seed data
npm run db:seed

# Or initialize schema only (without fixtures)
npm run db:init
```

From the `backend/` directory:

```bash
cd backend
npm run db:seed
```

The deterministic seed fixture populates 12 distinct user scenarios (matching users, non-matching count, non-matching purchase, exact boundary timestamps, and future-dated events) for canonical evaluation relative to `asOf: 2026-09-29T00:00:00.000Z`.

---

## 6. Running Frontend and Backend Independently

### Start the Backend

```bash
cd backend
npm run dev
```

* Running on `http://localhost:4000`
* Health Check: `GET http://localhost:4000/health`
* Preview API: `POST http://localhost:4000/v1/audiences/preview`

### Start the Frontend

```bash
cd frontend
npm run dev
```

* Running on `http://localhost:5173`
* Opens the Audience Builder interactive UI.

### Root Convenience Commands

From the monorepo root, you can also run:

| Command | Description |
| :--- | :--- |
| `npm run dev:backend` | Start backend development server |
| `npm run dev:frontend` | Start frontend development server |
| `npm run build` | Build both backend (`tsc`) and frontend (`vite build`) |
| `npm run type-check` | Run TypeScript check on both projects (`tsc --noEmit`) |
| `npm test` | Run complete backend and frontend test suites |
| `npm run db:init` | Initialize SQLite schema |
| `npm run db:seed` | Initialize schema and load synthetic seed fixtures |

---

## 7. API Reference: Audience Preview

### Endpoint
`POST /v1/audiences/preview`

### Canonical Request Example
```bash
curl -X POST http://localhost:4000/v1/audiences/preview \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Viewed but not purchased",
    "asOf": "2026-09-29T00:00:00.000Z",
    "conditions": [
      {
        "eventType": "product_view",
        "operator": "at_least",
        "count": 2,
        "withinDays": 7
      },
      {
        "eventType": "purchase",
        "operator": "exactly",
        "count": 0,
        "withinDays": 7
      }
    ]
  }'
```

### Canonical Response Example
```json
{
  "name": "Viewed but not purchased",
  "asOf": "2026-09-29T00:00:00.000Z",
  "totalMatchedUsers": 5,
  "matchedAnonymousUsers": 5,
  "matchedUsers": [
    {
      "userId": "anon_match_a",
      "isAnonymous": true,
      "evidence": [
        {
          "conditionIndex": 0,
          "eventType": "product_view",
          "operator": "at_least",
          "targetCount": 2,
          "actualCount": 3,
          "withinDays": 7,
          "windowStart": "2026-09-22T00:00:00.000Z",
          "windowEnd": "2026-09-29T00:00:00.000Z",
          "events": []
        },
        {
          "conditionIndex": 1,
          "eventType": "purchase",
          "operator": "exactly",
          "targetCount": 0,
          "actualCount": 0,
          "withinDays": 7,
          "windowStart": "2026-09-22T00:00:00.000Z",
          "windowEnd": "2026-09-29T00:00:00.000Z",
          "events": []
        }
      ]
    }
  ]
}
```

### Error Response Shape
All error responses return HTTP 4xx or 500 with a uniform JSON envelope:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request payload",
    "details": [
      {
        "field": "conditions.0.withinDays",
        "message": "withinDays must be greater than 0"
      }
    ]
  }
}
```

---

## 8. Testing, Type-Checking, and Builds

### Run Tests
```bash
# Monorepo test suite (113 backend tests + 37 frontend tests = 150 tests)
npm test

# Or backend only
cd backend && npm test

# Or frontend only
cd frontend && npm test
```

### Run Type-Checks
```bash
# Monorepo type-check
npm run type-check

# Backend only
cd backend && npm run type-check

# Frontend only
cd frontend && npm run type-check
```

### Production Build
```bash
# Monorepo production build
npm run build

# Backend only (outputs to backend/dist)
cd backend && npm run build

# Frontend only (outputs to frontend/dist)
cd frontend && npm run build
```

---

## 9. Assumptions and Design Limitations

1. **Anonymous Audience Segmentation**: The current database model and evaluation engine focus on anonymous users (`anonymous_users` and `events`).
2. **Deterministic Half-Open Window**: The time window is strictly half-open `[asOf - withinDays * 24h, asOf)`. The start boundary is inclusive (`occurred_at >= windowStart`), while the cutoff boundary is exclusive (`occurred_at < asOf`).
3. **Aggregate Evidence**: In accordance with the contract, condition-level evidence reports aggregate numbers (`actualCount`, `targetCount`, `windowStart`, `windowEnd`). Individual raw event logs are kept empty (`events: []`) to keep payload sizes lean and evaluation scalable.
4. **Single-Page Result Display**: The frontend displays all matched users returned by the preview API. For production scale with tens of thousands of users, server-side pagination or virtualization should be incorporated.
