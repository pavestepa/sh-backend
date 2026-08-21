# sh-backend

Backend for a mobile marketplace where the same user can post one-off jobs
(**customer**) and pick them up (**worker**) — think "need my sink fixed
today" for a single mid-size city (~400k people). NestJS + PostgreSQL/PostGIS
+ Prisma, deployed as a modular monolith.

## 1. Architecture

**Modular monolith, not microservices.** One deployable API, plus a second
process (the *worker*) that runs background jobs against the same database.
No message broker — PostgreSQL is the source of truth for both business data
*and* asynchronous work (via the transactional outbox and `pg-boss`, both
Postgres-backed).

```
src/
  main.ts            API entrypoint (HTTP)
  worker.ts           Background job entrypoint (no HTTP)
  app.module.ts        Root module wiring for the API process
  worker.module.ts     Root module wiring for the worker process

  config/              Typed, validated environment configuration
  prisma/               PrismaService (single shared client)
  common/
    errors/             DomainException + stable machine-readable error codes
    filters/             Global exception filter -> uniform API error shape
    guards/               JwtAuthGuard (global, opt-out via @Public())
    decorators/            @CurrentUser, @Public, @Idempotent
    idempotency/            Idempotency-Key enforcement + replay
    pagination/              Cursor pagination helpers
    logging/                 Structured JSON logger + request-id middleware
    security/                OTP/refresh-token hashing utilities

  auth/                 Phone+OTP login, JWT access tokens, refresh sessions
  users/                 User profile (name, avatar, active mode toggle)
  categories/            Hierarchical service categories (read-only API)
  profiles/               Worker's own profile self-service (description, categories)
  orders/
    orders.service.ts      All Order state-machine transitions live here
    domain/                  Transition table (source of truth for legal moves)
    infrastructure/           Raw-SQL PostGIS geo repository
    application/               OrderEvent (audit trail) writer
  applications/           Worker applications to orders
  photos/                  Presigned upload flow + photo status transitions
  storage/                 S3-compatible object storage abstraction (R2/MinIO)
  reviews/                 Reviews + rolling rating recalculation
  workers-public/          Public worker profile/history/portfolio/reviews API
  notifications/           Push device registry + NotificationProvider abstraction
  outbox/                  Transactional outbox writer
  jobs/                    pg-boss wiring, outbox processor, cron jobs
  health/                  /health/live, /health/ready
```

### Why modular monolith

At ~400k people, order volume never approaches a scale that needs
service decomposition, and every one of this domain's hard problems —
atomic worker selection, the order state machine, rating recalculation —
is *easier* to get right with real transactions across all the affected
tables. Splitting into services would mean distributed transactions or
eventual consistency for guarantees that a single `$transaction` gives for
free. One deployable is also what a single engineer can actually operate.

### Order state machine

```
OPEN ──(customer selects an application)──▶ ACCEPTED
ACCEPTED ──(selected worker starts)──▶ IN_PROGRESS
IN_PROGRESS ──(selected worker submits work)──▶ WAITING_CONFIRMATION
WAITING_CONFIRMATION ──(customer approves/completes)──▶ COMPLETED

OPEN, ACCEPTED, IN_PROGRESS ──(customer or selected worker, reason required past OPEN)──▶ CANCELLED
```

The legal-transitions table lives in `orders/domain/order-transitions.ts` and
is checked before every mutation. But the table alone doesn't prevent races —
see below.

### Concurrency: selecting a worker

Two customers can't double-book, but the real risk is one customer racing
themselves (double-tap) or two `select-application` calls interleaving. This
is solved with a conditional `UPDATE ... WHERE status = 'OPEN'` inside a
transaction (`OrdersService.selectApplication`):

```sql
UPDATE orders
SET status = 'ACCEPTED', "selectedApplicationId" = $1, ...
WHERE id = $2 AND status = 'OPEN'
```

If the row was already accepted by a concurrent request, this affects zero
rows and the service throws a 409. Postgres's row-level locking during the
`UPDATE` serializes concurrent attempts — no explicit `SELECT ... FOR UPDATE`
or app-level distributed lock needed. The same pattern (conditional `UPDATE`
+ affected-row check) guards `start`, `submitWork`, `complete`, and `cancel`.
This is exercised by `test/concurrency.e2e-spec.ts`, which fires two
`select-application` requests in parallel and asserts exactly one wins.

### Transactional outbox

Business transactions that need to trigger a side effect (a push
notification, a downstream job) never call the side effect inline — they
insert an `OutboxEvent` row in the *same* `$transaction` as the business
change. A separate cron job (`OUTBOX_PROCESSING`, every minute, run by the
worker process) claims pending rows with `FOR UPDATE SKIP LOCKED`, hands them
to `pg-boss`, and retries with exponential backoff on failure — see
`jobs/outbox-processor.service.ts`. This means a crash between "order
completed" and "notification sent" can never lose the notification: the
outbox row survives because it was part of the original commit.

### Idempotency

Every mutating endpoint that isn't naturally safe to retry (`create order`,
`create application`, `select-application`, `start`, `submit-work`,
`complete`, `create review`) requires an `Idempotency-Key` header, enforced
by `IdempotencyInterceptor`. First call executes normally and stores the
response; a retry with the same key+body replays the stored response without
re-running the handler. A retry with the same key but a *different* body is
rejected with 409 — keys must not be reused across distinct requests.

### Privacy-aware order visibility

Before a worker is selected, order listings only ever show an approximate
location (coordinates rounded to ~1km) and never the exact address — see
`OrdersService.toSummaryDto` / `toDetailDto`. Exact coordinates/address are
included only for the customer (their own order) and the selected worker,
once selected. Worker public history (`workers-public/`) never exposes a
past customer's phone, exact address, or private photos — it's a
purpose-built DTO, not a filtered dump of the internal entity.

### Photos and portfolio

`OrderPhoto` never stores a permanent public URL — only an `objectKey`.
Reads always mint a fresh signed GET URL through `StorageService`. Upload is
presigned-PUT: the API never proxies file bytes (see §11 flow below). A
worker's public portfolio is *not* a copy of anything — it's a live query:
`OrderPhoto` rows of type `WORKER_RESULT`, status `PUBLIC_PORTFOLIO`, whose
order is `COMPLETED` and among that worker's 50 most recently completed
orders. Photos falling outside that window keep existing in storage; nothing
is deleted just because it rotated out of the public 50 (that's a `README`
promise, not yet an automated retention job — see §15).

### Money and time

All prices are integers in minor units (kopecks) — never floats. `Order`
distinguishes `initialPriceMinor` (what the customer asked) from
`agreedPriceMinor` (set once, from the accepted application, at selection
time) — the initial price is never mutated by incoming applications.
Likewise `requiredAt` (customer's ask) vs `agreedWorkTime` (the selected
application's proposed time). All timestamps are stored and compared in UTC.

## 2. Prerequisites

- Node.js 20+ (developed against Node 23)
- Docker + Docker Compose (for local Postgres/PostGIS and MinIO)
- npm

## 3. Local setup

```bash
cp .env.example .env
docker compose up -d
npm install
npx prisma migrate deploy   # applies the committed migration
npm run seed                # optional: sample categories/users/orders
npm run start:dev           # API on http://localhost:3000
```

In a second terminal, run the background worker:

```bash
npm run start:worker
```

Swagger UI: `http://localhost:3000/docs`.

> **Note on first-ever worker startup against a brand-new database:**
> `pg-boss` self-migrates its own schema (`pgboss.*` tables) the first time
> it connects to a database that doesn't have them yet. On that very first
> run you may see a transient "relation does not exist" error while the
> schema is still being created — just restart the worker process; every
> run after that is unaffected since the schema now exists. This is a
> pg-boss cold-start quirk, not an application bug.

### If you don't want Docker

The API only needs a `DATABASE_URL` and an S3-compatible endpoint. Any local
Postgres 14+ with the `postgis` extension available, plus MinIO (or a real
R2/S3 bucket) works — point `.env` at them. `docker-compose.yml` is just the
convenient default.

## 4. Environments (DEV / TEST / PROD)

Three environments, three config files, each with a distinct database and
distinct safety posture:

| | File | Tracked in git? | Database | Loaded by |
|---|---|---|---|---|
| **DEV** | `.env` (from `.env.example`) | No — real file is gitignored | `sh_backend` | Prisma CLI/Client hardcode the literal filename `.env`, and so does `ConfigModule`'s default `envFilePath` — no extra wiring needed. |
| **TEST** | `.env.test` | **Yes** (dummy secrets, safe to commit) | `sh_backend_test` (separate DB) | `npm run test:e2e` runs `dotenv -e .env.test -- jest ...` — see "why not `envFilePath`" below. |
| **PROD** | *(none checked in)* — see `.env.production.example` | Template only | Managed Postgres | Real environment variables injected by the hosting platform/secret manager. If you must use a file, copy the template to `.env.production` (gitignored) and run `dotenv -e .env.production -- node dist/main`. |

**Why `dotenv-cli` instead of `@nestjs/config`'s `envFilePath` option:**
`@prisma/client` auto-loads the literal `.env` file itself, at import time,
independent of anything the app does — and dotenv never overrides a
variable that's already in `process.env`. So if `.env.test` were loaded
later via `ConfigModule`'s `envFilePath`, Prisma would have already locked
in `DATABASE_URL` from plain `.env`, silently pointing the "test" run at the
dev database. Setting `.env.test`'s values as real OS-level environment
variables *before* Node even starts (what `dotenv -e .env.test --` does)
sidesteps that precedence problem entirely — see
`src/config/env.validation.ts` and `package.json`'s `test:e2e` script.

**Production-only safety check:** `validateEnv()` refuses to boot when
`NODE_ENV=production` and `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` /
`OTP_HASH_PEPPER` / the `STORAGE_*` credentials still hold one of the
placeholder values from `.env.example` or `.env.test` — copying a dev
secret into prod by mistake fails fast at startup instead of shipping a
guessable secret. It also prints a startup warning (not fatal) if
`SMS_PROVIDER=mock` in production, since no real SMS provider is
implemented yet (§14) and that's easy to forget about after a soft launch.

### Key variables

See `.env.example` / `.env.production.example` for the full list with
comments. Highlights:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string (PostGIS extension required) |
| `TRUST_PROXY` | `true` behind a real reverse proxy/load balancer, so `req.ip` (OTP rate limiting, logs) reflects the real client IP via `X-Forwarded-For` instead of the proxy's own address. `false` for direct-connection dev/test. |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_TTL` etc. | Token signing/lifetime |
| `OTP_*` | OTP TTL, attempt limits, per-phone/per-IP rate limits |
| `SMS_PROVIDER` | `mock` writes the OTP to the log instead of sending an SMS — the only provider implemented today (§14) |
| `STORAGE_*` | S3-compatible endpoint/bucket/credentials (R2 in prod, MinIO locally) |
| `JOBS_SCHEMA` | Postgres schema pg-boss uses for its own tables |
| `ORDERS_*_SEARCH_RADIUS_M` | Default/max radius for geo order search |

## 5. Migrations

All schema changes go through committed migration files —
`prisma migrate dev` (development) / `prisma migrate deploy` (CI/prod)
never `prisma db push`. The initial migration
(`prisma/migrations/20260821000000_init/migration.sql`) additionally hand-adds
three statements Prisma's schema DSL can't express:

1. `CREATE EXTENSION IF NOT EXISTS postgis;`
2. A GiST index on `orders.location` (the `geography(Point,4326)` column,
   modeled in `schema.prisma` as `Unsupported(...)` since Prisma Client
   can't read/write PostGIS types directly — see
   `orders/infrastructure/orders-geo.repository.ts`, which does that in raw
   SQL).
3. A **partial** unique index —
   `(orderId, workerId) WHERE status = 'PENDING'` — enforcing "a worker has
   at most one active application per order" without permanently blocking a
   worker from re-applying after withdrawing (Prisma's schema DSL can't
   express a partial unique constraint).

## 6. Tests

```bash
npm test              # unit tests (pure logic: state machine, hashing, outbox retry/backoff)
npm run test:e2e       # integration tests against a real Postgres+PostGIS (and MinIO for the photo flow)
```

`test:e2e` runs via `dotenv -e .env.test -- jest ...`, which points the app
at a **separate** `sh_backend_test` database and relaxes the OTP rate limits
(the production defaults are intentionally strict enough that a test suite
registering many users would trip them — that's the rate limiter working
correctly, not a bug). Before running it the first time:

```bash
createdb sh_backend_test    # or: psql -c "CREATE DATABASE sh_backend_test"
psql -d sh_backend_test -c "CREATE EXTENSION IF NOT EXISTS postgis;"
DATABASE_URL=postgresql://sh:sh@localhost:5432/sh_backend_test npx prisma migrate deploy
```

The e2e suite covers: registration/login and refresh-token rotation, the
full order lifecycle (create → apply → select → start → upload+complete a
real presigned photo → submit → approve → complete → mutual reviews →
independent rating recalculation), the worker-selection race (two concurrent
`select-application` calls, asserting exactly one wins), ownership/role
checks (a non-owner can't select an application; a non-selected worker can't
start), and Idempotency-Key replay/conflict/required-header behavior.
Unit tests cover the order state machine, OTP secret hashing, and the
outbox processor's retry/backoff/permanent-failure logic.

## 7. Swagger

`GET /docs` once the API is running — full OpenAPI document generated from
the DTOs and controller decorators, with bearer-auth wired up so you can
paste an access token and call protected routes directly from the UI.

## 8. Running the API

```bash
npm run start:dev     # watch mode
npm run start          # single run
npm run build && npm run start:prod   # compiled, production-style
```

## 9. Running the worker

```bash
npm run start:worker
```

Same database, separate process, no HTTP server. Registers pg-boss job
handlers and cron schedules (`jobs/jobs-bootstrap.service.ts`):
`OUTBOX_PROCESSING` (every minute — drains the transactional outbox),
`ORDER_REMINDER` (every 15 minutes — scans upcoming accepted work),
`CLEAN_EXPIRED_OTP` / `CLEAN_EXPIRED_SESSIONS` (daily), and the ad-hoc
`SEND_PUSH_NOTIFICATION` / `PHOTO_PROCESSING` jobs the outbox processor
dispatches into.

## 10. R2 / MinIO configuration

`StorageService` (`src/storage/storage.service.ts`) talks to any
S3-compatible endpoint via the AWS SDK v3. Locally, `docker-compose.yml`
runs MinIO and creates the `sh-backend-dev` bucket automatically
(`minio-init` service). For Cloudflare R2 in production, set:

```
STORAGE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
STORAGE_REGION=auto
STORAGE_FORCE_PATH_STYLE=false
STORAGE_ACCESS_KEY_ID=<r2 access key>
STORAGE_SECRET_ACCESS_KEY=<r2 secret key>
```

Photo upload flow (never proxies bytes through the API):

```
mobile → POST /orders/:orderId/photos/upload-url  (backend creates an OrderPhoto row, PENDING_UPLOAD, + presigned PUT)
mobile → PUT <presigned url>                        (direct to R2/MinIO)
mobile → POST /photos/:photoId/complete              (backend HEADs the object: exists? size OK? → PRIVATE)
```

The backend cannot and does not claim to cryptographically prove a photo
came from a device camera — it only verifies the object was actually
uploaded and is within the size limit.

## 11. Order state transitions (API surface)

| Endpoint | Actor | From → To |
|---|---|---|
| `POST /orders` | customer | — → `OPEN` |
| `POST /orders/:id/applications` | worker | (order stays `OPEN`) |
| `PATCH /orders/:id/select-application` | customer (owner) | `OPEN` → `ACCEPTED` |
| `PATCH /orders/:id/start` | selected worker | `ACCEPTED` → `IN_PROGRESS` |
| `PATCH /orders/:id/submit-work` | selected worker | `IN_PROGRESS` → `WAITING_CONFIRMATION` |
| `PATCH /orders/:id/complete` | customer (owner) | `WAITING_CONFIRMATION` → `COMPLETED` |
| `PATCH /orders/:id/cancel` | customer or selected worker | `OPEN`/`ACCEPTED`/`IN_PROGRESS` → `CANCELLED` (reason required past `OPEN`) |

Every transition is a conditional `UPDATE` guarded by the current status
(§ Concurrency above), records an immutable `OrderEvent`, and — where
relevant — enqueues an `OutboxEvent` for notification.

## 12. Deployment notes

- Two processes, one image: `npm run start:prod` (API) and
  `npm run start:worker:prod` (worker), same build output, same
  `DATABASE_URL`.
- No in-memory state the API depends on for correctness — sessions, OTPs,
  idempotency records, and outbox events are all in Postgres. The one
  exception is the `ThrottlerModule`'s in-memory request counter, which is
  a soft defense-in-depth layer on top of the DB-backed OTP rate limiting
  and is fine to reset on restart/scale.
- Graceful shutdown: `app.enableShutdownHooks()` is on for both processes.
  `PrismaService` disconnects on `OnModuleDestroy`; the worker's
  `PgBossService` calls `boss.stop({ graceful: true })`, letting in-flight
  jobs finish before exiting.
- All configuration is environment variables (`src/config`), validated at
  boot (`env.validation.ts`) — the process refuses to start with an invalid
  or incomplete config rather than failing later at first use.
- Structured JSON logs to stdout only (`AppLogger`) — no file logging, so
  the process stays stateless; a request's `requestId` ties its log lines
  together end-to-end. OTP codes, tokens, and presigned URLs are never
  logged (redacted by key name).
- Set `TRUST_PROXY=true` in production (see §4) — almost every real
  deployment target (a load balancer, ingress, or CDN) sits in front of the
  API, and without this `req.ip` resolves to the proxy's address instead of
  the real client's, silently breaking the per-IP OTP rate limit and
  request logs.

## 13. Why modular monolith (again, briefly)

See §1. Short version: at this scale, the hard parts of this product
(atomic worker selection, a correct state machine, accurate ratings) are
transactional problems, and a monolith gives real transactions for free.

## 14. What was intentionally not built

Per the brief, none of the following were added, and none should be added
without a deliberate scale-driven reason:

- Kafka / RabbitMQ / Redis — Postgres is the only stateful dependency.
- Kubernetes — two processes, one database; a Dockerfile and
  `docker-compose.yml` are enough for this stage.
- GraphQL / WebSockets — REST + polling is sufficient for this domain.
- Microservices, event sourcing, CQRS framework — see §1/§13.
- Payments/escrow, in-app chat, AI-based matching — out of scope for MVP.
- Distributed locks — the conditional-`UPDATE` pattern (§ Concurrency)
  gives the one atomicity guarantee this product actually needs, without
  needing a lock service.
- Premature caching — no cache layer exists; add one only once a real
  bottleneck is measured.
- Aggressive photo retention/deletion — the architecture supports adding a
  retention job later (original vs. compressed-variant lifetimes), but nothing
  auto-deletes photos today. `jobs/photo-processing.service.ts` is a
  placeholder for thumbnail/compression generation, wired into the job
  queue but not yet implemented.
- A full payment/dispute system for cancellations — cancellation rules
  (§11) are deliberately simple: a reason is required past `OPEN`, and
  every cancellation is recorded as an `OrderEvent`, but there's no refund
  or arbitration logic since there's no payment flow yet.
