# QA Automation Orchestrator

This standalone module turns CI failures, Sentry alerts, and PR metadata into validated ClickUp work items.

## What It Does

- Creates structured ClickUp bug tasks from Playwright and Cypress failures
- Creates structured ClickUp bug tasks from Sentry issue alerts
- Generates sanity, edge, negative, and acceptance tests from PR metadata
- Routes bugs to owners using a component-to-team map with a QA fallback
- Applies validation rules before creating work in ClickUp

## Project Layout

```text
qa-orchestrator/
├─ app/
│  ├─ main.py
│  ├─ routes/
│  ├─ services/
│  ├─ schemas/
│  └─ config.py
├─ tests/
├─ cypress/
├─ playwright.config.ts
├─ cypress.config.ts
├─ requirements.txt
└─ README.md
```

GitHub Actions live at the repository root in `.github/workflows/` because GitHub only executes workflow files from that location.

## Local Setup

1. Create a virtual environment:

   ```bash
   cd qa-orchestrator
   python -m venv .venv
   source .venv/bin/activate
   ```

   On Windows PowerShell:

   ```powershell
   cd qa-orchestrator
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   ```

2. Install Python dependencies:

   ```bash
   pip install -r requirements.txt
   ```

3. Install Node dependencies for Playwright and Cypress:

   ```bash
   npm install
   ```

4. Copy the example environment file and populate it:

   ```bash
   cp .env.example .env
   ```

5. Run the API:

   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```

6. Check health:

   ```bash
   curl http://127.0.0.1:8000/health
   ```

## Environment Variables

Required values:

```env
ANTHROPIC_API_KEY=your_key
CLICKUP_API_TOKEN=your_token
CLICKUP_LIST_ID=your_bug_list_id
CLICKUP_TEST_CASES_LIST_ID=your_test_cases_list_id
FASTAPI_BASE_URL=https://your-backend.com
```

Recommended optional values:

```env
APP_ENV=production
APP_HOST=0.0.0.0
APP_PORT=8000
MIN_BUG_CONFIDENCE=0.65
CLICKUP_DEFAULT_STATUS=Open
CLICKUP_TRIAGE_STATUS=Needs Triage
CLICKUP_TEST_CASE_STATUS=Open
CLICKUP_CF_SEVERITY_ID=
CLICKUP_CF_COMPONENT_ID=
CLICKUP_CF_ENVIRONMENT_ID=
CLICKUP_CF_BUILD_NUMBER_ID=
CLICKUP_CF_SOURCE_ID=
CLICKUP_CF_CONFIDENCE_ID=
CLICKUP_CF_ASSIGNED_TEAM_ID=
OWNER_MAP={"payments":["payments-owner-user-id"],"qa":["qa-lead-user-id"]}
COMPONENT_MAP={"payments":"backend","unknown":"qa"}
ALLOWED_COMPONENTS=["frontend-ui","authentication","api","payments","notifications","infrastructure","mobile-app","qa-platform","unknown"]
```

## GitHub Actions Secrets and Variables

Add this repository secret:

- `FASTAPI_WEBHOOK_URL`

Optional repository variable:

- `E2E_BASE_URL`

The workflows are:

- `.github/workflows/e2e-playwright.yml`
- `.github/workflows/e2e-cypress.yml`
- `.github/workflows/ai-test-writer.yml`

## ClickUp Setup

1. Create two lists:
- `QA Bugs`
- `Generated Test Cases`

2. Create custom fields on `QA Bugs`:
- `Severity`
- `Component`
- `Environment`
- `Build Number`
- `Source`
- `Confidence`
- `Assigned Team`

3. Copy each field ID from the ClickUp URL or API response and set:
- `CLICKUP_CF_SEVERITY_ID`
- `CLICKUP_CF_COMPONENT_ID`
- `CLICKUP_CF_ENVIRONMENT_ID`
- `CLICKUP_CF_BUILD_NUMBER_ID`
- `CLICKUP_CF_SOURCE_ID`
- `CLICKUP_CF_CONFIDENCE_ID`
- `CLICKUP_CF_ASSIGNED_TEAM_ID`

4. Create automations in ClickUp:
- When task created and `Severity = Critical` -> assign to backend lead
- When task created and `Component = Payments` -> assign to Payments owner
- When custom field `Assigned Team` changes -> move task to the matching sprint or list

5. Get API token and list IDs:
- API token: ClickUp -> Settings -> Apps -> API Token
- List IDs: open the list in ClickUp and inspect the URL, or fetch them with the ClickUp API

## Sentry Webhook Setup

1. In Sentry, open `Alerts -> Create Alert Rule`.
2. Choose `Issue` alerting.
3. Configure the conditions you care about, for example:
- issue occurs more than 1 time in 10 minutes
- level is error or fatal

4. Add a webhook action pointing to:

```text
https://your-fastapi-host/webhooks/sentry/issue
```

5. Send a test alert from Sentry and confirm the endpoint responds with `200 OK`.

## Validation Rules

Implemented in `app/services/validation_service.py`:

- confidence below `0.65` skips bug creation
- severity is limited to `low`, `medium`, `high`, `critical`
- teams are limited to `frontend`, `backend`, `devops`, `qa`, `mobile`
- critical severity is downgraded if production impact is not evident
- empty titles are rejected
- reproduction steps must be a list
- hallucinated “confirmed root cause” phrasing is sanitized
- ambiguous but still useful bugs default to `Needs Triage`

## End-to-End Test Flow

1. Set `FASTAPI_WEBHOOK_URL` in GitHub secrets.
2. Set `E2E_BASE_URL` to a reachable environment.
3. Push a branch or open a PR.
4. Force a failing Playwright or Cypress test.
5. Watch the workflow post to `/webhooks/github/test-failure`.
6. Confirm the FastAPI service validates the payload, calls Claude, and creates a ClickUp bug.
7. Open a PR and confirm `.github/workflows/ai-test-writer.yml` posts to `/generate-tests`.
8. Confirm a task appears in the `Generated Test Cases` list.

## Test the Python Validation Layer

```bash
cd qa-orchestrator
pytest
```
