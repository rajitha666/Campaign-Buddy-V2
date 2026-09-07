# Campaign Buddy — Backend (v3)

Implements `docs/backend-spec.md` end to end: mobile app (`/v1/*`) and the
Admin/Supervisor/Sponsor portal (`/admin/v1/*`), one codebase, one database.

## Stack
Node.js, TypeScript, Express, PostgreSQL, Prisma. Two independent JWT spaces (Staff / User).

## Setup
```bash
npm install
cp .env.example .env        # then fill in DATABASE_URL and both JWT secrets
npx prisma migrate dev --name init
npm run prisma:seed
npm run dev
```
Server starts on `http://localhost:4000`. `GET /health` is a quick liveness check.

## Seeded logins (after `npm run prisma:seed`)
- **Admin portal:** `admin` / `ChangeMe123!`
- **Mobile app:** `sktest` / `Field123!`

## Tests
```bash
cp .env.test.example .env.test    # must point DATABASE_URL at a *_test database
npm test                          # vitest run  (19 integration tests, supertest)
npm run test:watch
```
`test/setup.ts` refuses to run unless `DATABASE_URL` ends in `_test` — the suite
`TRUNCATE`s every table between files. Covers the load-bearing logic, not just
2xx: geofence soft-flag, one-open-shift lock, supervisor auto-grant, status
manual-override persistence, RBAC 403s, `passwordHash` scrub, zod 400s,
FK-delete 409s.

## What's implemented
Every endpoint in Backend Spec v3 §4, including the three items new in v3:
- `GET /admin/v1/staff/:staffId/evaluation` — Staff Profiles evaluation view
- `GET /admin/v1/campaigns/:campaignId/sales/lookup` — Update Sales cascading lookup
- Full `SupervisorRoute` CRUD — `/admin/v1/campaigns/:campaignId/supervisor-routes` (Assign Routes)

Every confirmed v3 business rule is implemented as documented in the spec:
- Geofence check-in is a **soft flag only** (`src/modules/mobile/attendance.routes.ts`) — never blocks.
- Global one-open-shift lock across every campaign (`attendance.routes.ts`).
- Supervisor auto-grant on Activation assignment — always `"subset"`, never `"all"` by default (`src/modules/admin/activations.routes.ts`).
- `Campaign.status` auto-syncs from dates but accepts a manual override (`src/modules/admin/campaigns.routes.ts`, `src/utils/campaignStatus.ts`).
- `requireCampaignAccess` (`src/middleware/campaignAccess.ts`) is the single RBAC mechanism for Admin, Supervisor, and Sponsor alike — no separate portal codebases, no separate report routes.

## Portal-completion endpoints (added on top of Spec v3 §4.2)

Backend Spec v3 §4.2 was a first-pass endpoint set; the web portal
(`campaign-buddy-portal`) needs the rest of the CRUD plus a few computed
reports. These were added and every portal screen now has a real route:

- **Catalog:** `PATCH`/`DELETE /brands/:id`, `DELETE /items/:id`,
  `PATCH`/`DELETE /cities/:id`, `DELETE /outlets/:id`,
  `PATCH`/`DELETE /distributor-points/:id`
- **`DELETE /campaigns/:campaignId`** (cascades), **`DELETE /staff/:id`**,
  **`PATCH /roles/:id`**
- **`GET /campaigns/:id/activations/:activationId/items`**; the items `POST`
  also accepts `{ campaignItemIds: [...] }` and is idempotent
- **`GET /campaigns/:id/supervisor-tasks`** + `POST`/`PATCH`/`DELETE`
  (the `SupervisorTask` table finally gets its endpoints)
- **`GET /campaigns/:id/absence?date=`** — promoters scheduled but not checked in
- **`GET /campaigns/:id/outlet-attendance?date=`** — supervisor visit log
- **`GET /campaigns/:id/tracking/promoter-history`** and
  **`/tracking/supervisor-history`** — raw GPS breadcrumb trail (campaign-scoped,
  same as `tracking/live` per §5.9)
- **`GET /campaigns/:id/reports/outlet-wise`** — per-outlet footfall + sales
- `GET /campaigns/:id/attendance` gained a `?role=promoter|supervisor` filter;
  `/stats` `byDay` rows now carry `outletId`/`outletName`/`staffName`;
  `/reports/*` list rows come back as `data[]` + `meta.grandTotal` with
  `itemName`/`brandName` fields and accept `outletId` + `dateFrom`/`dateTo`.

All computed reports follow §5.2 (derive at read time, never store).
`errorHandler` maps Prisma `P2025`/`P2002`/`P2003` and validation errors to
proper 4xx codes. `utils/dates.ts` centralises UTC-midnight parsing for the
`@db.Date` columns.

## Runtime request validation

Every write route (`/v1/*` and `/admin/v1/*`) runs its body/query/params through a
zod schema before the handler — `src/middleware/validate.ts` + `src/schemas.ts`
(~40 schemas). Bad input returns `400 VALIDATION_ERROR` with the offending
`field`. Date-only strings (`YYYY-MM-DD`) are coerced to `Date` for Prisma
`DateTime` columns; `staff` / `activation` writes additionally whitelist columns.

## What's still deliberately NOT implemented (see Spec v3 §8)
- Staff password reset delivery (stub, generic response only)
- User (portal) refresh-token flow (re-login required on expiry, by design)
- Configurable geofence radius / grace period per campaign (both are fixed defaults for now)
- Staff HR photo upload / the ~30-field HR form (schema comment: out of scope for v3)
- `SupervisorTask` is configurable via the portal, but the mobile app doesn't consume it yet

## Project layout
```
prisma/
  schema.prisma      canonical data model (matches docs/archive/schema-v3.prisma)
  seed.ts            seed data — 4 roles, 1 admin user, 1 sample campaign/activation/staff login
src/
  app.ts             Express app wiring (mounts /v1 and /admin/v1, error handler last)
  server.ts          entry point
  middleware/
    staffAuth.ts / userAuth.ts   the two independent JWT verifiers
    campaignAccess.ts           requireCampaignAccess + outletIdsAllowed/assertOutletAllowed
    errorHandler.ts             formats every ApiError per the spec's response envelope
    validate.ts                zod body/query/params middleware
  schemas.ts                   ~40 zod schemas for every write route
  utils/
    apiResponse.ts              ApiError, ok()/okList() envelope helpers (+ passwordHash scrub)
    geo.ts                      haversine distance (geofence soft-flag calc only)
    salesCalc.ts                totalSales / SalesSummary rollups — always computed, never stored
    campaignStatus.ts           Campaign.status auto-sync computation
    coerce.ts                   YYYY-MM-DD -> Date coercion for the portal's date inputs
    dates.ts                    UTC-midnight helpers for @db.Date column filters
  modules/
    mobile/          one file per endpoint group — auth, attendance, location, stats, products, sales-summary, time-off, performance
    admin/           one file per endpoint group — auth, catalog, staff, campaigns, activations, operations, reports, rbac
test/              vitest + supertest integration suite (setup.ts, helpers.ts, *.test.ts)
```

## Known gaps in this scaffold (worth hardening before production)
- No rate limiting / helmet / request logging middleware.
- Prisma `include` depth in a few report/list endpoints is a straightforward first pass — profile and add indexes/pagination limits under real data volume.
- `SalesSummary` / `DailyStats` rollups recompute on every read (§5.2) — fine now, revisit with caching/materialized views if a campaign's per-day item count grows very large.
