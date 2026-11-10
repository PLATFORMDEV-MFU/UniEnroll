# UniEnroll

Course enrollment and add/drop platform built with Next.js, Hono, Cloudflare Workers, and Cloudflare D1.

## Requirement coverage

- Available sections, enrollment/history, and staff override screens
- Add, swap, drop, withdraw, availability, and staff override REST operations
- Deterministic prerequisite, 22-credit, schedule-conflict, duplicate, and capacity rules
- Atomic D1 seat updates: first committed request wins; the loser receives `422 ERR_CAPACITY_FULL`
- Idempotent enrollment creation through `Idempotency-Key`
- AI-assisted explanations through Workers AI; deterministic rule-list fallback on timeout/error
- Transactional webhook outbox with HMAC-SHA256 delivery, stable `event_id`, bounded retry, and staff-triggered recovery
- Automated Workers/D1 tests, including 49/50 plus two simultaneous requests and 60 requests for 50 seats

The shared HTTP and webhook contract is in [`docs/openapi.yaml`](docs/openapi.yaml).

## Architecture

```text
Next.js client
    |
    v
Hono API on Cloudflare Workers
    |-- Cloudflare D1 (transactional enrollment state)
    |-- Workers AI (explanation only, never eligibility)
    `-- signed enrollment.changed webhook
```

Eligibility is always decided by deterministic code. AI only rewrites failed rules in plain language. If AI is unavailable, the API immediately returns the deterministic explanation.

## Local setup

Requirements: Node.js 20+, pnpm, and a Cloudflare account for remote deployment.

```bash
pnpm install
pnpm run db:migrate:local
pnpm run db:seed:local
pnpm run backend:dev
```

In another terminal:

```bash
pnpm run dev
```

Frontend: `http://localhost:3000`

Backend: `http://localhost:8787`

Set the frontend API origin when needed:

```text
NEXT_PUBLIC_API_URL=http://localhost:8787
```

## Runtime configuration

Non-secret Worker variables are in `wrangler.jsonc`:

- `AI_EXPLANATIONS_ENABLED`
- `AI_EXPLANATION_MODEL`

Set integration values before enabling partner delivery:

```bash
wrangler secret put WEBHOOK_SIGNING_SECRET
```

Configure `PARTNER_WEBHOOK_URL` after the instructor provides the other team's endpoint. Do not commit the signing secret. The publisher safely skips delivery when either the URL or secret is absent.

If a partner needs authenticated access to protected API routes, configure its incoming key separately:

```bash
wrangler secret put PARTNER_API_KEY
wrangler secret put INCOMING_WEBHOOK_SECRET
```

`JWT_SECRET` is required (minimum 32 characters). Authentication fails closed when it is missing; configure it as a Worker secret:

```bash
wrangler secret put JWT_SECRET
```

The destructive `/api/seed` route is disabled unless `SEED_ENABLED=true`; do not
set that variable in production. Even when enabled, the route requires a staff JWT
and a `SEED_ACCOUNT_PASSWORD` secret of at least 16 characters; the secret is
validated before any tables are cleared and must not equal a public account code.

`test_api.mjs` is a non-destructive live smoke test and requires
`TEST_STUDENT_CODE` and `TEST_STUDENT_PASSWORD`. `test_a5_integration.mjs` performs
live mutations and additionally requires `TEST_STAFF_CODE`, `TEST_STAFF_PASSWORD`,
`PARTNER_API_KEY`, and `INCOMING_WEBHOOK_SECRET`; run it only against an explicitly
approved environment.

## Commands

```bash
pnpm test               # automated Workers + D1 tests
pnpm run typecheck      # TypeScript
pnpm run lint           # ESLint
pnpm run build          # Next.js production build
pnpm run backend:dev    # local Worker
pnpm run backend:deploy # deploy Worker
```

## Critical capacity behavior

Capacity is protected twice:

1. A fast availability check returns a clear error when a section is already full.
2. The D1 `CHECK (enrolled_count <= max_capacity)` constraint and transactional batch are the final atomic guard.

For a section at 49/50 with two simultaneous requests, exactly one request can commit:

- Winner: `201 Created`
- Loser: `422 ERR_CAPACITY_FULL`
- Final count: exactly `50`
- Active enrollment rows: exactly `50`

The error response includes `contention_policy: FIRST_COMMITTED_REQUEST_WINS` and explains that the last seat was committed by another request.

## Automated test coverage

The suite runs in the Cloudflare Workers runtime with an isolated D1 database and includes:

1. Add success
2. Drop success and seat return
3. Full-section rejection
4. Prerequisite rejection with structured failed rules
5. Duplicate request/idempotency replay
6. Student override authority rejection
7. Webhook retry with the same `event_id`
8. AI success and deterministic fallback
9. 49/50 plus two concurrent requests
10. 60 concurrent requests for 50 seats
11. 22-credit limit
12. Schedule conflict
13. Concurrent same-course section requests (one active section only)
14. Concurrent duplicate idempotency-key coalescing and body-mismatch rejection
15. Concurrent drop, withdraw, and swap transitions; PATCH status rejection
16. Staff-only seed and webhook-log access

Run:

```bash
pnpm test
```

## Database

Schema: `src/backend/db/schema.sql`

Seed data: `src/backend/db/seed.sql`

For an existing D1 database, apply and verify `src/backend/db/migration_check.sql`
before deploying this Worker. Creating tables with `IF NOT EXISTS` does not retrofit
the `sections.enrolled_count <= max_capacity` constraint onto an older table.
The course-level duplicate-enrollment triggers in `schema.sql` must also exist in
the deployed database. The automated test database always starts from the complete
current schema; it does not prove that a remote D1 instance has been migrated.

The seed includes prerequisite rules and completed-course evidence so both eligible and ineligible flows can be demonstrated.

## Integration boundary

UniEnroll owns the publisher and shared contract. The eventual partner URL remains configuration, not source code. Partner consumers must deduplicate by `event_id` because retries can deliver an event more than once.
