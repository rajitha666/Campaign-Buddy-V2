# Campaign Buddy — Agent Guidelines

Field-marketing execution platform for in-store product activations. One backend serves two front ends.

## Repository structure

| Folder | Product | Stack | Port |
|---|---|---|---|
| `campaign-buddy-backend/` | API server | Node · TypeScript · Express · PostgreSQL · Prisma | `:4000` |
| `campaign-buddy-portal/` | CB Office (web portal) | React · Vite | `:5173` |
| `campaign-buddy-app/` | CB Mobile (field-rep app) | React Native · Expo SDK 57 | Expo |
| `docs/` | specs & product docs | — | — |
| `marketing/` | customer-facing collateral: `landing-site/`, `capability-brief.html`, `training/` (per-role user guides, shipped in-product) | static HTML, no build | — |

## Prerequisites

- Node 20+ (built on Node 24 LTS)
- PostgreSQL 14+ (built on PG 16)

## Quick start

```bash
# Backend
cd campaign-buddy-backend && npm install && cp .env.example .env && npx prisma migrate dev && npm run prisma:seed && npm run dev

# Portal
cd campaign-buddy-portal && npm install && npm run dev

# Mobile app
cd campaign-buddy-app && npm install --ignore-scripts && cp .env.example .env && npm run start -- --web
```

For a populated dataset (demos, marketing screenshots): after `npm run prisma:seed`,
`cd campaign-buddy-backend && npm run prisma:seed:demo` builds the
"Radiance Q3 Push" sample campaign — 4 outlets, 4 promoters, 2 supervisors, a
week of attendance / sales / footfall / tracking data. Re-runnable; leaves the
base seed's data alone.

## CI

`.github/workflows/ci.yml` runs on every push to `main` and every PR: backend
tests (against a real Postgres, including running `prisma:seed:demo` as a
drift check against the latest migrations), portal tests, and app
typecheck + tests, plus Playwright e2e for portal and app (against the
demo-seeded backend — portal: per-persona nav smoke + two pinned bug
regressions; app: a login smoke test against the Expo web build, since no
simulator/emulator is set up here). A separate job comments on PRs that touch
portal/app UI source without a matching `marketing/training/` change — see
"Keep the user guides in sync" below.

## Tests

```bash
cd campaign-buddy-backend && npm test   # vitest + supertest (needs *_test DB)
cd campaign-buddy-portal  && npm test   # vitest unit
cd campaign-buddy-app     && npm test   # vitest unit
```

## Issue naming convention

Prefix all issue titles with the component they affect:

- `[backend]` — API, Prisma, database, endpoints
- `[portal]` — CB Office web app
- `[app]` — CB Mobile React Native app
- `[docs]` — documentation only
- `[infra]` — CI/CD, devops, shared config

Examples:
- `[backend] Add bulk outlet import endpoint`
- `[portal] Fix campaign list pagination`
- `[app] Sync offline reports on reconnect`

## Keep the user guides in sync

`marketing/training/` is shipped **inside the product** — CB Office serves it at
`/training/<role>.html` (account menu; `admin`/`supervisor` also get the promoter
guide), CB Mobile links to `promoter.html` from Profile + the Home `?` button,
and the marketing site serves the same files publicly.

If a change alters what a user sees or does on a portal or app screen (nav,
buttons, columns, fields, flow, a new feature a role can use), update the
matching guide — `admin.html` / `supervisor.html` / `sponsor.html` /
`promoter.html` — in the same PR. Screenshots are `assets/<role>/NN-<slug>.webp`;
swap in place, same filename. Full procedure and the screen↔guide map:
`marketing/training/MAINTENANCE.md`.

## Token usage — keep it minimal

- Read only the files you need; avoid dumping entire codebases.
- Use targeted `grep`/`glob` instead of reading large directories.
- When editing, read the specific file section, not the whole file.
- Prefer surgical edits over rewriting large blocks.
- Summarise findings in your own words; do not echo file contents back.
- Batch tool calls where possible to reduce round-trips.
- Skip verbose explanations unless asked.

## Demo credentials (seed data)

| Surface | Username | Password |
|---|---|---|
| CB Office | `admin` | `ChangeMe123!` |
| CB Mobile | `sktest` | `Field123!` |

## Key docs

- `docs/backend-spec.md` — canonical backend spec
- `docs/admin-panel-spec.md` — CB Office spec
- `docs/api-spec.md` — Mobile `/v1` API contract
- `docs/product-documentation.md` — feature reference
- `docs/archive/` — superseded specs, do NOT build against
- `marketing/README.md` — the landing site, evaluation brief and user-training guides
