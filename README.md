# Campaign Buddy

Field-marketing execution platform for agencies running in-store product
activations — a promoter stationed in a retail outlet for a campaign, selling a
client's products and reporting stock, footfall and sales every day.

One backend serves two front ends:

| Folder | Product | Stack | Runs on |
|---|---|---|---|
| [`campaign-buddy-backend/`](campaign-buddy-backend/) | **API** — serves both clients | Node · TypeScript · Express · PostgreSQL · Prisma | `:4000` |
| [`campaign-buddy-portal/`](campaign-buddy-portal/) | **CB Office** — web portal for head office, supervisors and sponsors | React · Vite | `:5173` |
| [`campaign-buddy-app/`](campaign-buddy-app/) | **CB Mobile** — the field-rep app | React Native · Expo SDK 57 | Expo (web/device) |

`campaign-buddy-portal` and `campaign-buddy-app` are independent apps — no shared
package, no build orchestration. Each has its own `package.json`, `README.md` and
`.env.example`; start with the per-app README for anything beyond the quick start
below.

## Repository layout

```
campaign-buddy-backend/   API + Prisma schema + migrations + test suite
campaign-buddy-portal/    CB Office (React/Vite SPA)
campaign-buddy-app/       CB Mobile (Expo / React Native)
docs/                     specs, changelog, product documentation
  archive/                superseded specs — kept for history, do NOT build against
marketing/                customer-facing collateral (landing site, evaluation brief, user-training guides)
```

## Prerequisites

- **Node 20+** (built and tested on Node 24 LTS)
- **PostgreSQL 14+** (built on PG 16). The backend `.env.example` expects a local
  instance; adjust `DATABASE_URL` to your setup.

## Quick start

### 1. Backend (`:4000`)

```bash
cd campaign-buddy-backend
npm install
cp .env.example .env            # set DATABASE_URL + JWT secrets
npx prisma migrate dev          # create schema
npm run prisma:seed             # demo client, campaign, outlet, one promoter
npm run dev
```

For a fuller dataset, run `npx ts-node prisma/demo-seed.ts` as well — it builds
the "Radiance Q3 Push" sample campaign (4 outlets, 4 promoters, 2 supervisors, a
week of activity) used by the demos and the training screenshots. Re-runnable.

### 2. CB Office portal (`:5173`)

```bash
cd campaign-buddy-portal
npm install
npm run dev                     # dev proxy forwards /admin/v1/* to :4000
```

Open http://localhost:5173 and sign in as `admin` / `ChangeMe123!`.

### 3. CB Mobile app

```bash
cd campaign-buddy-app
npm install --ignore-scripts
cp .env.example .env            # EXPO_PUBLIC_API_BASE_URL=http://localhost:4000/v1
npm run start -- --web          # browser preview; or: npm run android / npm run ios
```

Sign in as `sktest` / `Field123!`.

## Tests

Each app has its own suite:

```bash
cd campaign-buddy-backend && npm test    # vitest + supertest integration (needs a *_test DB — see its README)
cd campaign-buddy-portal  && npm test    # vitest unit
cd campaign-buddy-app     && npm test    # vitest unit
```

## Documentation

| File | What it is |
|---|---|
| [`docs/product-documentation.md`](docs/product-documentation.md) | Every feature of CB Office and CB Mobile, in plain language |
| [`docs/technical-requirements.md`](docs/technical-requirements.md) | What each app needs to build and run (Node, PostgreSQL, Expo, ports, env vars) |
| [`docs/backend-spec.md`](docs/backend-spec.md) | **Canonical** backend specification (data model, endpoints, business rules) |
| [`docs/admin-panel-spec.md`](docs/admin-panel-spec.md) | CB Office feature & field-level specification |
| [`docs/api-spec.md`](docs/api-spec.md) | Mobile `/v1` API contract (what CB Mobile is built to) |
| [`docs/changelog.md`](docs/changelog.md) | v3 consolidation decision log |
| `docs/archive/` | Superseded specs — historical context only, not a build target |
| [`marketing/README.md`](marketing/README.md) | Landing site, evaluation brief, and per-role user-training guides |

## Demo credentials (seed data)

Base seed (`npm run prisma:seed`):

| Surface | Username | Password |
|---|---|---|
| CB Office | `admin` | `ChangeMe123!` |
| CB Mobile | `sktest` | `Field123!` |

Demo seed (`npx ts-node prisma/demo-seed.ts`, adds "Radiance Q3 Push"):

| Surface | Username | Password |
|---|---|---|
| CB Office (supervisor) | `supervisor` | `Portal123!` |
| CB Office (sponsor) | `sponsor` | `Portal123!` |
| CB Mobile (Sanduni Kumari, Nawala) | `0771234567` | `Field123!` |
| CB Mobile (Kasun Perera, Rajagiriya) | `0762223344` | `Field123!` |
