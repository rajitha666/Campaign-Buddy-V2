# Campaign Buddy — Backend (v3)

Implements `CampaignBuddy_Backend_Spec_v3.md` end to end: mobile app (`/v1/*`) and the
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

## What's deliberately NOT implemented (see Spec v3 §8)
- `SupervisorTask` CRUD (table exists, no endpoints — QA checklist workflow deferred)
- Staff password reset delivery (stub, generic response only)
- User (portal) refresh-token flow (re-login required on expiry, by design)
- Configurable geofence radius / grace period per campaign (both are fixed defaults for now)
- Automated test suite

## Project layout
```
prisma/
  schema.prisma      canonical data model (matches CampaignBuddy_schema_v3.prisma)
  seed.ts            seed data — 4 roles, 1 admin user, 1 sample campaign/activation/staff login
src/
  app.ts             Express app wiring (mounts /v1 and /admin/v1, error handler last)
  server.ts          entry point
  middleware/
    staffAuth.ts / userAuth.ts   the two independent JWT verifiers
    campaignAccess.ts           requireCampaignAccess + outletIdsAllowed/assertOutletAllowed
    errorHandler.ts             formats every ApiError per the spec's response envelope
  utils/
    apiResponse.ts              ApiError, ok()/okList() envelope helpers
    geo.ts                      haversine distance (geofence soft-flag calc only)
    salesCalc.ts                totalSales / SalesSummary rollups — always computed, never stored
    campaignStatus.ts           Campaign.status auto-sync computation
  modules/
    mobile/          one file per endpoint group — auth, attendance, location, stats, products, sales-summary, time-off, performance
    admin/           one file per endpoint group — auth, catalog, staff, campaigns, activations, operations, reports, rbac
```

## Known gaps in this scaffold (worth hardening before production)
- No request-body schema validation library wired in (e.g. zod) — inputs are trusted/typed at the TS layer only, not runtime-validated. Add before exposing publicly.
- No automated tests (matches Spec v3 §8 — flagged there too).
- No rate limiting / helmet / request logging middleware.
- Prisma `include` depth in a few report/list endpoints is a straightforward first pass — profile and add indexes/pagination limits under real data volume.
