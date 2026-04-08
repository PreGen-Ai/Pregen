# PreGen LMS — Test Suite Documentation

## Overview

This document describes the full test suite for the PreGen LMS, which covers:
- **Backend** — Jest + Supertest + mongodb-memory-server (unit + integration)
- **Frontend** — React Testing Library (unit)
- **E2E** — Cypress (full-stack end-to-end)

---

## 1. Backend Tests

**Location:** `backend/tests/`

**Framework:** Jest 29 + Supertest + mongodb-memory-server

### Test Files

| File | Coverage |
|------|----------|
| `01_health.test.js` | Health endpoint, 404 handling, CORS, malformed JSON |
| `02_auth.test.js` | Login (success/fail/disabled/blocked), checkAuth, expired token, profile |
| `03_rbac.test.js` | All 5 roles × all role-gate routes (STUDENT/TEACHER/ADMIN/SUPERADMIN/PARENT) |
| `04_users.test.js` | User list, block/unblock, soft delete/restore, role update, signup |
| `05_courses.test.js` | Course CRUD, archive, delete, public listing, tenant isolation |
| `06_announcements.test.js` | Announcement CRUD, role access (TEACHER+ create, STUDENT read-only) |
| `07_gradebook.test.js` | Grade read (all roles), grade update (TEACHER+ only) |
| `08_teacher.test.js` | Teacher dashboard, assignments, quiz management, course roster |
| `09_student.test.js` | Student assignments, quizzes, workspaces, results, leaderboard |
| `10_admin.test.js` | Admin dashboard, users, classes, subjects, branding, AI settings |
| `11_superadmin.test.js` | System routes, tenant management, AI cost, feature flags, redirect |
| `12_documents.test.js` | Document search, upload gates, soft delete/restore/hard delete, bulk ops |
| `13_ai_routes.test.js` | AI endpoint auth gates, AI usage logging, quiz routes |
| `14_security.test.js` | NoSQL injection, oversized payloads, Helmet headers, no password leak |

### Setup

```bash
cd backend
npm install
npm test          # Run all tests
npm run test:coverage   # With coverage report
npm run test:ci   # CI mode (no watch, force exit)
```

**Note:** Tests use mongodb-memory-server — no real MongoDB connection needed.

### How It Works

- `globalSetup.cjs` — starts mongodb-memory-server, sets `MONGO_URI`, `JWT_SECRET`, etc. in env
- `globalTeardown.cjs` — stops the in-memory MongoDB after all suites
- `helpers/db.js` — connects/disconnects mongoose per test file
- `helpers/factory.js` — creates real DB documents (users, courses) with valid JWT tokens
- `helpers/app.js` — builds Express app without `app.listen()` for supertest

---

## 2. Frontend Unit Tests

**Location:** `frontend/src/__tests__/`

**Framework:** React Testing Library + Jest (via react-scripts)

### Test Files

| File | Coverage |
|------|----------|
| `roleMatrix.test.js` | Role matrix structure, all 5 roles, correct permissions, cross-role isolation |
| `pages/Assignments.test.jsx` | API mock integration for assignment CRUD operations |
| `pages/Login.test.jsx` | Login API mock scenarios (success, wrong creds, disabled, expired) |
| `api/api.test.js` | API client namespace shape — all methods exist as functions |

### Running

```bash
cd frontend
npm run test:unit       # Single run with coverage
npm test                # Interactive watch mode
npm run test:ci         # CI mode
```

---

## 3. Cypress E2E Tests

**Location:** `frontend/cypress/e2e/`

**Framework:** Cypress 13

### Test Files

| File | Coverage |
|------|----------|
| `01_auth.cy.js` | API health, login form, invalid creds, session, logout, token security |
| `02_student_flow.cy.js` | Student full journey — dashboard, assignments, quizzes, grades, RBAC blocks |
| `03_teacher_flow.cy.js` | Teacher journey — dashboard, assignments CRUD, quizzes, gradebook |
| `04_admin_flow.cy.js` | Admin panel — users, classes, subjects, branding, AI controls, RBAC |
| `05_superadmin_flow.cy.js` | SuperAdmin — tenants, AI cost, audit logs, feature flags, redirect |
| `06_ai_features.cy.js` | AI endpoints — access control, health checks, tutor UI, usage tracking |

### Setup

1. Copy `cypress.env.json.example` → `cypress.env.json` and fill in real credentials
2. Start backend: `cd backend && npm run dev`
3. Start frontend: `cd frontend && npm start`
4. Run Cypress:

```bash
cd frontend
npm run cy:open        # Interactive (recommended for debugging)
npm run cy:run         # Headless single run
npm run cy:run:headless  # CI headless
```

### Seed Users Required

The E2E tests assume these users exist in the database. Use the seed script or create them via the admin panel before running:

| Role | Email | Password |
|------|-------|----------|
| STUDENT | student@pregen.test | Password1! |
| TEACHER | teacher@pregen.test | Password1! |
| ADMIN | admin@pregen.test | Password1! |
| SUPERADMIN | superadmin@pregen.test | Password1! |

---

## 4. Test Strategy

### Backend Test Philosophy

- **Real database** (in-memory MongoDB) — no mocks for DB operations
- **Mocked AI service** — tests verify auth gates pass/fail; AI service timeouts are expected
- **Factory-created users** — each test creates fresh users with real bcrypt-hashed passwords and valid JWTs
- **clearAllCollections()** before each test — complete isolation between tests

### Coverage Targets

- Auth & RBAC: 100% of role combinations for all protected routes
- API endpoints: All 50+ endpoints verified for correct auth response
- Security: NoSQL injection, oversized payloads, missing auth, tampered tokens, leaked secrets
- Frontend: API client shape, role matrix correctness

### CI/CD Integration

```yaml
# Example GitHub Actions steps
- name: Backend tests
  run: cd backend && npm ci && npm run test:ci

- name: Frontend unit tests
  run: cd frontend && npm ci && npm run test:ci

- name: E2E tests (requires running app)
  run: |
    cd backend && npm run start &
    cd frontend && npm start &
    cd frontend && npm run cy:run:headless
```

---

## 5. Known Limitations

1. **AI service not mocked in integration tests** — routes that proxy to FastAPI will return 5xx, not 200. Tests verify auth gates only.
2. **Cloudinary uploads** — document upload tests verify auth gates pass; actual file storage not tested (no Cloudinary in CI).
3. **E2E tests require seeded users** — if test users are not in the DB, tests skip gracefully using `cy.skip()`.
4. **GridFS reports** — PDF generation tests verify auth; PDF content not asserted in unit tests.
