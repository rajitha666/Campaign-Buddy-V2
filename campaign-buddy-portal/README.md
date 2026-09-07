# Campaign Buddy — Web Portal (CB Office)

React + Vite frontend for the Campaign Buddy web portal — **one app, one login**
serving three personas (Admin, Supervisor, Sponsor). What a signed-in user sees is
driven entirely by their `roleId` and their `CampaignAccessGrant`s.

Canonical backend contract: [`docs/backend-spec.md`](../docs/backend-spec.md)
(data model, endpoints, RBAC in §3). UI-level feature detail:
[`docs/admin-panel-spec.md`](../docs/admin-panel-spec.md).

This is **frontend only**. It calls the backend's `/admin/v1/*` API — no mock data
is baked in; every screen hits a real endpoint and shows a loading / error / empty
state until the backend is reachable.

## Status

Wired to `campaign-buddy-backend` and verified in-browser (2026-09-06) for all
three personas — CRUD, leave approval, activation-item management, live map,
reports. The backend implements **every endpoint this portal calls**; there are no
"assumed" / unbuilt endpoints anymore (`lib/endpoints.js` still exports a small
`assumed.*` object, but it's just back-compat aliases onto the real functions).

## Getting started

```bash
npm install
cp .env.example .env      # point VITE_API_BASE_URL at your backend, or leave it
                          # blank to use the Vite dev proxy (see vite.config.js)
npm run dev               # http://localhost:5173
```

The dev proxy forwards `/admin/v1/*` to `http://localhost:4000`. Override with
`VITE_API_PROXY_TARGET=http://your-host:port npm run dev`, or set
`VITE_API_BASE_URL` directly for a production build (`npm run build`).

Sign in with the seeded Super Admin: `admin` / `ChangeMe123!`.

## Tests

```bash
npm test          # vitest run
npm run test:watch
```

`src/lib/endpoints.test.js` pins the path/verb every endpoint helper builds
(catalog CRUD, campaign-scoped id nesting, the `assumed.*` aliases → real routes).
`src/config/resources.test.jsx` checks every resource entry is wired end to end
(list / edit / delete handlers present, form-field shapes valid). No network —
`apiClient` is mocked.

## How roles map to the UI

`AuthContext.roleToPersona()` collapses `roleId` into the three personas the UI
renders differently:

| `roleId` (backend) | persona | behaviour |
|---|---|---|
| `adm` (Super Admin), `usr` (Campaign Admin) | `admin` | full sidebar, all CRUD |
| `supervisor` | `supervisor` | narrow sidebar, read-only, outlet-scoped |
| `sponsor` | `sponsor` | campaign overview + reports, read-only, campaign-scoped |

The four seeded roles are `adm`, `usr`, `supervisor`, `sponsor` — there is no
`super` or `client` role in this system. `roleToPersona()` still maps those two
legacy ids (`super`→admin, `client`→sponsor) as a harmless fallback; an unknown
`roleId` defaults to the read-only `supervisor` persona.

`adm` and `usr` share the `admin` nav persona but are **not** equivalent for data
access: `adm` bypasses `CampaignAccessGrant` entirely and sees every campaign;
`usr` is grant-scoped exactly like supervisor/sponsor.

Read-only enforcement in the UI (hiding Add/Edit/Delete) is a convenience only —
**the backend enforces it too** (`requireRole("adm","usr")` on every write route),
so a supervisor/sponsor token is rejected on writes regardless of what the client
does.

The campaign switcher in the top bar lists exactly what `GET /admin/v1/campaigns`
returns for the user — their granted campaigns (or all, for `adm`). Switching
re-scopes every campaign-bound screen.

## Project structure

```
src/
  lib/apiClient.js       fetch wrapper: base URL, auth header, error envelope, 401 -> logout
  lib/endpoints.js       one function per /admin/v1 endpoint
  context/AuthContext    login/logout, current user, persona, campaign switcher
  context/ToastContext   toast notifications
  config/nav.js          sidebar structure + per-persona visibility
  config/resources.jsx   list/CRUD page configs (columns, filters, forms, endpoints)
  components/             AppShell, Sidebar, Topbar, DataTable, Drawer (add/edit forms), etc.
  pages/ResourcePage.jsx  generic list + CRUD page driven by config/resources.jsx
  pages/DashboardRouter   renders Dashboard (admin/supervisor) or SponsorDashboard
  pages/*.jsx             bespoke pages that don't fit the generic table shape:
                          Dashboard, SponsorDashboard, LiveMap, MonthlyAttendance,
                          StaffProfiles (evaluation), UpdateSales, CampaignItems,
                          ActivationItems, ActivationTargets, AssignRoutes
  styles/                 tokens.css (design tokens) + app.css
```

Most screens (Clients, Campaigns, Outlets, Staff, Items, Users, Roles, every log
and report table) are a single config entry in `config/resources.jsx` rendered by
the generic `ResourcePage`. Add a new list/CRUD screen by adding a config entry,
not a new component. A screen only gets its own file when it isn't a table
(dashboards, the map, the month grid, the cascading-filter editors).

## Staff form

The Add/Edit Staff form matches the **v3 HR field set** (`docs/backend-spec.md`
§2.4) — Basic Info, Login, Emergency Contact, Bank Account, as sections in one
drawer. This is the final, deliberate scope: **no profile-photo upload, no marital
status / proficiency ratings / work-type pick-lists.** The backend whitelists these
columns and ignores extras. If the fuller HR form is ever wanted it's a schema
migration + spec revision, not a gap to fill here.

## Reports — no client-scoped variants

Sponsor / "client" reports use the **same** endpoints as Admin
(`/reports/sku-wise`, `/reports/brand-wise`) — the response is automatically
filtered to the caller's grant. There is no `-client` route variant. The
`clientReports` / `brandWiseClient` resource configs and the `/reports/client-*`
routes are just alternate UI entry points onto those same endpoints.

## Known simplifications (fine for now, worth revisiting at scale)

- **Foreign keys are resolved to display names client-side** (`hydrate` in
  `config/resources.jsx`) — a lookup-list fetch per page load, not a backend join.
  Cheap now; cache it (React Query or similar) once data volumes grow.
- **Excel/CSV export is generated client-side** from the currently-loaded rows,
  not a true server-side export of the full filtered set.
- **The live map (`LiveMapView`) lays pins out in a grid**, not on a geographic
  projection — swap in Mapbox/Leaflet using the real `latitude`/`longitude` when
  accurate positioning matters.
- **No token-refresh flow.** Per `docs/backend-spec.md` §3.2 the portal's User
  tokens are not refreshable by design — a 401 anywhere clears the token and sends
  the user to `/login`. (CB Mobile's staff tokens *do* refresh; the portal's don't.)
- **Dashboard KPIs are composed client-side** from `GET /campaigns/:id/stats` +
  `/reports/*` — there's no single dashboard-aggregation endpoint. Fine at current
  scale.

## Design system

Tokens live in `src/styles/tokens.css` — ink-green (`--ink: #12241F`) + mango
(`--mango: #FF7A33`), Poppins for headings/stats (`.h-display`), Liberation Sans
for body, rounded status chips as badges. Shares the palette with CB Mobile. Don't
hardcode colours inline — add a token.
