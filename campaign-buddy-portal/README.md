# Campaign Buddy — Web Portal (Admin / Supervisor / Sponsor)

React + Vite frontend for the unified web portal described in
`CampaignBuddy_Unified_Backend_Spec.md`. One app, one login, one set of
routes — what a signed-in user sees is driven entirely by their `roleId`
and `CampaignAccessGrant`s, per that spec's §3 (Auth & RBAC Model).

This is **frontend only**. It expects your backend to implement the
`/admin/v1/*` API described in the spec docs. No mock data is baked in —
every screen calls a real endpoint and will show a loading/error/empty
state until your backend is reachable.

## Changelog

- **Seller Live Locations is now visible to all three roles** (Admin, Supervisor, Sponsor), not just Sponsor — same `/tracking/live` page and endpoint, just added to the Admin's Tracking submenu and as a standalone item for Supervisor. No API change; this was a nav-visibility-only gap.
- **Staff profile photo upload is now a separate endpoint.** `POST /staff` and `PATCH /staff/{id}` stay plain JSON — the picked file is uploaded via a new `POST /staff/{id}/photo` (`multipart/form-data`) call, made automatically right after create/update only if the admin actually picked a new file. See `docs/archive/full-backend-contract.md` §4.9.1 / §10.10 for the backend side.
- **Staff form completed** (full ~30-field HR record) and a **CRUD-wiring
  audit fixed 8 resources** where an Edit or Delete button was rendered but
  had no `updateItem`/`deleteItem` function behind it — meaning Edit would
  have silently created a duplicate record instead of updating, and Delete
  would have done nothing. Fixed for: `staff`, `brands`, `items`, `outlets`,
  `distributors`, `cities`, `campaigns` (delete), `supervisorTasks`,
  `roles` (update). Matching `PATCH`/`DELETE` endpoints were added to
  `lib/endpoints.js` for all of these — see `docs/archive/full-backend-contract.md`
  if any of those paths need reconciling with what the backend actually
  implements.

## Getting started

```bash
npm install
cp .env.example .env      # point VITE_API_BASE_URL at your backend, or leave
                           # blank to use the Vite dev proxy (see vite.config.js)
npm run dev
```

Default dev proxy forwards `/admin/v1/*` to `http://localhost:4000`. Override
with `VITE_API_PROXY_TARGET=http://your-host:port npm run dev`, or set
`VITE_API_BASE_URL` directly for a production build (`npm run build`).

## Tests

```bash
npm test          # vitest run
npm run test:watch
```

`src/lib/endpoints.test.js` pins the path/verb every endpoint helper builds
(catalog CRUD, campaign-scoped id nesting, the `assumed.*` compat shims →
real v3 routes). `src/config/resources.test.jsx` checks every resource entry
is wired end to end (list/edit/delete handlers, form-field shapes). No
network — `apiClient` is mocked.

## How roles map to the UI

`AuthContext.roleToPersona()` collapses the backend's `roleId` values down
to three UI personas:

| roleId (backend)      | persona (frontend) | behavior                          |
|------------------------|---------------------|------------------------------------|
| `adm`, `usr`, `super`  | `admin`             | full sidebar, all CRUD actions     |
| `supervisor`           | `supervisor`        | narrow sidebar, read-only          |
| `sponsor`, `client`    | `sponsor`           | campaign overview + reports, read-only |

Read-only enforcement here is a UI convenience (hides Add/Edit/Delete
buttons) — **the spec requires the backend to enforce this too** (§3, step
3: "Admin roles get full CRUD; supervisor and sponsor roles are read-only
at the API level regardless of what's passed"). Don't rely on the frontend
alone.

The campaign switcher in the top bar lists whatever `GET /campaigns`
returns for the logged-in user — i.e. exactly their `CampaignAccessGrant`s.

## Project structure

```
src/
  lib/apiClient.js       fetch wrapper: base URL, auth header, error envelope
  lib/endpoints.js       one function per endpoint in the Unified Backend Spec §4
  context/AuthContext    login/logout, current user, persona, campaign switcher
  context/ToastContext   toast notifications
  config/nav.js          sidebar structure + per-persona visibility
  config/resources.jsx   list/CRUD page configs (columns, filters, forms, endpoints)
  components/            Sidebar, Topbar, DataTable, Drawer (add/edit forms), etc.
  pages/ResourcePage.jsx generic list+CRUD page driven by config/resources.jsx
  pages/*.jsx            bespoke pages that don't fit the generic table shape
                          (Dashboard, Sponsor overview, live map, calendar,
                          monthly attendance grid, staff evaluation, Update Sales,
                          Campaign/Activation Items, Activation Targets)
```

Most admin-panel screens (Clients, Campaigns, Outlets, Staff, Items, Users,
Roles, all the report tables, etc.) are one config entry in
`config/resources.jsx` rendered by the generic `ResourcePage`. Add a new
list/CRUD screen by adding a config entry, not a new component.

## ⚠️ Endpoints this frontend calls that aren't in the spec yet

The Unified Backend Spec (§4) doesn't cover every screen in the Admin Panel
Feature Spec. Where a screen exists in the feature spec but has no
documented endpoint, `lib/endpoints.js` exports it under `assumed` with a
best-guess path/shape, and the page itself has an inline note. **Confirm
these with the backend team before relying on them**:

- `GET  /campaigns/{id}/absence` — Staff Absence report
- `GET  /staff/{staffId}/evaluation` — Staff Profiles performance analytics
- `GET/POST /campaigns/{id}/supervisor-tasks` — Supervisor QA task checklist
- `GET  /campaigns/{id}/outlet-attendance` — Supervisor outlet-visit log
- `GET/POST /supervisor-routes` — Assign Routes calendar
- `GET  /sales/lookup` — Update Sales' cascading-filter lookup (loads a
  day's SalesRecords for editing; the save itself uses the documented
  `PATCH /campaigns/{id}/sales/{salesRecordId}`)
- `GET  /campaigns/{id}/reports/sku-wise-client`,
  `GET  /campaigns/{id}/reports/brand-wise-client` — the sponsor/client-scoped
  report variants (admin spec §3.11's `item_wise_c` / `brand_wise_c`)
- `GET  /campaigns/{id}/tracking/promoter-history`,
  `GET  /tracking/supervisor-history` — historical GPS breadcrumb trail.
  The spec only defines *live* tracking (`GET /campaigns/{id}/tracking/live`,
  used by the Sponsor's live map); the Admin Panel's raw lat/lng/time trail
  tables need a separate history endpoint.

Also worth raising with the backend team:
- **Activation Items has no GET or DELETE** in the spec — only
  `POST .../activations/{id}/items`. The Activation Items page can attach
  items but can't show what's already attached after a page reload. Add a
  GET (and ideally a DELETE) to close this gap.
- **No dashboard aggregation endpoint.** `Dashboard.jsx` and
  `SponsorDashboard.jsx` compose `GET /campaigns/{id}/stats` +
  `/reports/sku-wise` client-side. Fine for now; consider a dedicated
  endpoint if a campaign's daily-stats volume makes that slow.
- **Outlet Wise sales rollup** is derived client-side from `DailyStats` for
  the same reason — a real `/reports/outlet-wise` endpoint would be cleaner
  and scale better.

## Staff form (now complete)

The Add/Edit Staff form covers the full ~30-field HR record from
`CampaignBuddy_AdminPanel_Feature_Specification.md` §3.5.1 — Basic Info,
Emergency Contact, Bank Account Details, Skills & Qualifications, and Work
Details, as five visually-divided sections in one drawer (see the `section`
field type in `components/Drawer.jsx`). Two field types were added to
`Drawer.jsx` to support this:
- `type: 'date'` — a single date input (distinct from the existing `daterange`).
- `type: 'creatable'` — a select with a fixed option list plus an "Other
  (type below)" choice that reveals a free-text input; used for Designation,
  which the admin panel spec describes as "choose from the list or type
  custom."

Confirm the exact field names in `config/resources.jsx` (`staff.formFields`)
match your `Staff` table's real column names before first test — they're
named to match the spec's HR field labels as closely as possible
(`emergencyContactName`, `bankAccountNumber`, `englishSpeaking`, etc.) but
weren't specified verbatim anywhere, so this is the one form where a rename
on the backend side is likely to need a matching rename here.

## Known simplifications (fine for a first pass, worth revisiting)

- Foreign keys (`clientId`, `brandId`, `outletId`, `staffId`, …) are
  resolved to display names via a client-side lookup fetch (see `hydrate`
  in `config/resources.jsx`), not a backend join. This re-fetches the
  lookup list on every page load — cheap at prototype scale, worth caching
  (React Query or similar) once real data volumes show up.
- Excel export buttons generate a CSV client-side from whatever rows are
  currently loaded (not a true server-side export of the full filtered set).
- The live map (`LiveMapView`) lays out pins in a grid, not on a real
  geographic projection — swap in Mapbox/Leaflet using the real
  `latitude`/`longitude` once you want accurate positioning.
- No token refresh flow — a 401 anywhere logs the user out and sends them
  to `/login`. Add `POST /admin/v1/auth/refresh` if/when the backend
  supports it (the mobile API already does; the admin auth endpoint in the
  spec doesn't mention one).

## Design system

Reuses the mobile app's tokens (`src/styles/tokens.css`): ink-green
(`#12241F`) + mango (`#FF7A33`), Poppins for headings/stats, Liberation
Sans for body text, rounded status chips as badges.
