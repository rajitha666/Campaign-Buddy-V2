# Portal Change Backlog

Change requests captured while testing the **campaign-buddy-portal** (React + Vite).

## Batch 1 — SHIPPED (branch `portal-changes-batch-1`)

Frontend-only, no new dependencies, no backend changes. Build + tests green.

| # | Change | Status | Files |
|---|--------|--------|-------|
| 1 | Login: remove `POST /admin/v1/auth/login` hint → "Dyuro Technologies" credit line | ✅ | [`Login.jsx`](campaign-buddy-portal/src/pages/Login.jsx), `.login-credit` in [`app.css`](campaign-buddy-portal/src/styles/app.css) |
| 2a | Modern scrollbars app-wide (thin, rounded, themed; Firefox + WebKit) | ✅ | [`app.css`](campaign-buddy-portal/src/styles/app.css) `* scrollbar` block, tokens `--scroll-*` |
| 2b | Collapsible side menu — icon rail, hover flyouts for sub-menus, choice persisted to `localStorage`, auto-collapse ≤980px | ✅ | [`AppShell.jsx`](campaign-buddy-portal/src/components/AppShell.jsx), [`Sidebar.jsx`](campaign-buddy-portal/src/components/Sidebar.jsx), `.nav-collapsed` rules in [`app.css`](campaign-buddy-portal/src/styles/app.css) |
| 3a | Dashboard map — outlets + live sales-staff positions, projected on real lat/lng | ✅ | new [`CampaignMap.jsx`](campaign-buddy-portal/src/components/CampaignMap.jsx), used in [`Dashboard.jsx`](campaign-buddy-portal/src/pages/Dashboard.jsx) |
| 3b | "Customers Approached Today" stat card | ✅ | [`Dashboard.jsx`](campaign-buddy-portal/src/pages/Dashboard.jsx) (from `GET /campaigns/{id}/stats` totals) |
| 3c | "Top 10 products by sales — this activation" (full campaign date range) | ✅ | [`Dashboard.jsx`](campaign-buddy-portal/src/pages/Dashboard.jsx) (sku-wise report over `startDate..min(endDate,today)`) |
| 3d | "Most-requested products" — customers who asked but didn't buy | ✅ | [`Dashboard.jsx`](campaign-buddy-portal/src/pages/Dashboard.jsx) — client-side aggregation of `SalesRecord.otherInterestedCustomers` by item |
| 4 | Overview subtitle → `Campaign Name \| Client \| Start – End` | ✅ | [`Dashboard.jsx`](campaign-buddy-portal/src/pages/Dashboard.jsx) `overviewSubtitle()` (client name from `client.clientName`/`companyName`) |
| 5 | Daily 3-colour chart — foot fall / approached / converted | ✅ | new [`TrendChart.jsx`](campaign-buddy-portal/src/components/TrendChart.jsx), used in [`Dashboard.jsx`](campaign-buddy-portal/src/pages/Dashboard.jsx). Conversion shown as the **converted count** series; overall conversion **%** in the panel subtitle. |

### Decisions taken during the build
- **No map library.** `CampaignMap` is a dependency-free SVG that projects real lat/lng (equirectangular, longitude × cos(mean lat)) into the panel's own pixel box, matching the house style (the old `LiveMapView` was an explicitly-stylised placeholder). Swap in Leaflet/Mapbox later if a basemap is wanted — `CampaignMap` is the single place to change.
- **No chart library.** `TrendChart` is a hand-rolled grouped-bar SVG, consistent with the existing "Sales this week" bars.
- **No backend changes.** Everything is composed from existing endpoints. `otherInterestedCustomers` is aggregated client-side from `GET /campaigns/{id}/sales`; outlet pins come from `GET /campaigns/{id}/activations` (includes `outlet` with coords); staff pins from `GET /campaigns/{id}/tracking/live` (`lastPosition`, falling back to the outlet location when no GPS ping exists).
- **Scope:** only the admin/supervisor `Dashboard.jsx`. `SponsorDashboard.jsx` still uses the old `LiveMapView` and unchanged panels — a follow-up could adopt `CampaignMap` / `TrendChart` there too.

### Not done / follow-ups
- Adopt `CampaignMap` on `/tracking/live` and the sponsor dashboard.
- If a real basemap is needed, add Leaflet + OSM tiles (or Mapbox with a token in `.env`).
- Optional backend `reports/interest-wise` endpoint if the client-side interest aggregation gets slow on large campaigns.
- Trend chart shows every campaign day in a horizontally-scrolling strip; if campaigns run very long, consider weekly buckets.

---

## Batch 2 — SHIPPED (branch `portal-changes-batch-2`, stacked on batch 1)

| # | Change | Status | Where |
|---|--------|--------|-------|
| 1 | Collapsed sidebar header was cramped (logo vs expand toggle overlapped) | ✅ | `.nav-collapsed .brand-row` now stacks logo + toggle vertically ([`app.css`](campaign-buddy-portal/src/styles/app.css)) |
| 2 | Rename **Items → Products** across the UI | ✅ | [`nav.js`](campaign-buddy-portal/src/config/nav.js), [`resources.jsx`](campaign-buddy-portal/src/config/resources.jsx) (titles/subtitles/columns/form labels), [`CampaignItems.jsx`](campaign-buddy-portal/src/pages/CampaignItems.jsx), [`ActivationItems.jsx`](campaign-buddy-portal/src/pages/ActivationItems.jsx), `ActivationTargets`/`UpdateSales`/`StaffProfiles`. API/route/data-model names unchanged. |
| 3 | Client column on the Brands table | ✅ | [`resources.jsx`](campaign-buddy-portal/src/config/resources.jsx) `brands` — client-side hydrate by `clientId` (no backend change) |
| 4 | Reorder DATE defaults to today | ✅ | see #8 |
| 5 | Reorder: Outlet + Brand filter dropdowns | ✅ | [`resources.jsx`](campaign-buddy-portal/src/config/resources.jsx) `reorder` filters; `FilterBar` gained an `allLabel` "All …" option; backend `reports/reorder` now accepts `brandId` and returns `brandName` ([`reports.routes.ts`](campaign-buddy-backend/src/modules/admin/reports.routes.ts)) |
| 6 | Real OpenStreetMap basemap on **all** map views | ✅ | `leaflet@1.9.4` added; [`CampaignMap.jsx`](campaign-buddy-portal/src/components/CampaignMap.jsx) rewritten on Leaflet + OSM tiles; [`LiveMapView.jsx`](campaign-buddy-portal/src/components/LiveMapView.jsx) now delegates to it; `LiveMap` + `SponsorDashboard` pass outlet coords through |
| 7 | Campaigns list: read-only products popup (kept the editable one) | ✅ | new [`Modal.jsx`](campaign-buddy-portal/src/components/Modal.jsx) + [`CampaignProductsModal.jsx`](campaign-buddy-portal/src/components/CampaignProductsModal.jsx); `viewItems` row action in [`resources.jsx`](campaign-buddy-portal/src/config/resources.jsx) / [`ResourcePage.jsx`](campaign-buddy-portal/src/pages/ResourcePage.jsx) |
| 8 | Every single-date filter defaults to today | ✅ | [`ResourcePage.jsx`](campaign-buddy-portal/src/pages/ResourcePage.jsx) seeds `filterValues` for filters with `key: 'date'`. Applies to Reorder, Staff Absence, Sales Update Status, Outlet Attendance, Promoter/Supervisor Tracking. `dateFrom`/`dateTo` **ranges left open** on purpose (standard for range filters); form-entry dates (DOB, campaign/activation ranges) untouched. Month pickers + Update Sales already defaulted. |

### Decisions taken
- **Leaflet, not react-leaflet** — plain imperative Leaflet keeps the dep tree tiny and avoids React-version coupling. OSM tiles need network at runtime (fine for a normal web app).
- **Items→Products is UI-only** — endpoint paths (`/items`), API method names, Prisma models, and the `item_wise` enum value are unchanged; only visible text moved. The "Item Wise" activation target option is now labelled "Product Wise" (value still `item_wise`).
- **Brand column on Brands** done client-side (fetch clients, map by id) — same pattern as the existing Items→Brand hydrate; no backend change. The reorder brand **filter** did need a backend tweak because reorder rows had no brand info.
- **Date-range filters stay empty.** #8 said "wherever there is a date picker" but defaulting a From/To pair to today would silently hide all history; single-date filters are the ones that showed the ugly `YYYY-MM-DD`.

### Follow-ups
- Sponsor dashboard + `/tracking/live` now use the Leaflet map too, but their surrounding layouts weren't otherwise revisited.
- `CampaignProductsModal` footer scrolls with the list on very long catalogs (header X always works).

## Batch 3 — IN PROGRESS (branch `feature/portal-ux-enhancements`)

| # | Change | Status | Files |
|---|--------|--------|-------|
| 1 | Campaign Products: searchable (substring, name/SKU) product picker + bulk "Add Selected" (checkboxes) instead of one-at-a-time dropdown | ✅ | [`CampaignItems.jsx`](campaign-buddy-portal/src/pages/CampaignItems.jsx); backend `POST /campaigns/:id/items` now also accepts `itemIds:[...]` ([`campaigns.routes.ts`](campaign-buddy-backend/src/modules/admin/campaigns.routes.ts), [`schemas.ts`](campaign-buddy-backend/src/schemas.ts) `campaignItemAdd`) |
| 2 | Add/Edit form drawer: section headings (e.g. "Login", "Emergency Contact", "Bank Account") rendered with no CSS at all → browser-default size, mismatched vs field labels | ✅ | [`app.css`](campaign-buddy-portal/src/styles/app.css) new `.section-divider` rule — matches `.form-row label` sizing (12px/700, uppercase), plus a top divider line. Shared `Drawer.jsx`, so fixes every resource's form, not just Staff. |
| 3 | Add New Activation: Promoter/Supervisor dropdowns showed only a first name, no search, no employee ID | ✅ | new [`SearchableSelect.jsx`](campaign-buddy-portal/src/components/SearchableSelect.jsx) (type-to-filter combobox); new `searchable-select` field type in [`Drawer.jsx`](campaign-buddy-portal/src/components/Drawer.jsx); `staffOptions()` helper in [`resources.jsx`](campaign-buddy-portal/src/config/resources.jsx) labels options `"Full Name — EMP-0004"` |
| 4 | Add New Activation: same searchable-dropdown treatment for Outlet + Distributor Point | ✅ | [`resources.jsx`](campaign-buddy-portal/src/config/resources.jsx) `activations.formFields` — both now use the same `searchable-select` type |
| 5 | Add New Activation: Date range now pre-fills from the parent campaign's start/end dates (still freely editable, not constrained) | ✅ | new `addDefaults` hook on a resource config, wired in [`ResourcePage.jsx`](campaign-buddy-portal/src/pages/ResourcePage.jsx) `openDrawer()`; `activations.addDefaults` in [`resources.jsx`](campaign-buddy-portal/src/config/resources.jsx) |
| 6 | Super Admin **and** existing Campaign Admins of a campaign can now link a Campaign Admin account (new or existing) to that campaign — for admins joining mid-campaign. Multiple admins per campaign supported; linking never removes another. | ✅ | New backend routes on [`campaigns.routes.ts`](campaign-buddy-backend/src/modules/admin/campaigns.routes.ts): `GET/POST /campaigns/:id/admins`, `DELETE /campaigns/:id/admins/:userId`, `GET /campaigns/:id/admin-candidates` (role-safe user search, doesn't expose the `[adm]`-only `/users` list); `s.campaignAdminAdd` in [`schemas.ts`](campaign-buddy-backend/src/schemas.ts). New page [`CampaignAdmins.jsx`](campaign-buddy-portal/src/pages/CampaignAdmins.jsx), reusing `SearchableSelect`; new `admins` row action (icon in [`Icons.jsx`](campaign-buddy-portal/src/components/Icons.jsx), route in [`App.jsx`](campaign-buddy-portal/src/App.jsx), wiring in [`ResourcePage.jsx`](campaign-buddy-portal/src/pages/ResourcePage.jsx)/[`resources.jsx`](campaign-buddy-portal/src/config/resources.jsx)). |

### Decisions taken (#6)
- **New campaign-scoped routes, not a loosened `rbac.routes.ts`.** That file is `[adm]`-only for *all* user/role administration (create any user, list every user, manage roles) — opening it to `usr` would let any Campaign Admin manage arbitrary accounts. Instead, `/campaigns/:id/admins*` reuses the existing `requireCampaignAccess` middleware, which already lets `adm` through unconditionally and requires `usr` to hold a grant for that specific campaign — exactly the "existing admins of a campaign" rule.
- **`/campaigns/:id/admin-candidates`** exists so a `usr` admin (who cannot call the `[adm]`-only `GET /users`) can still search for an existing Campaign Admin account to link — it only ever returns `roleId:"usr"` rows and only the 4 fields needed to pick one.
- **This endpoint only ever creates/links `roleId:"usr"` accounts** — both the inline "new account" path and linking an existing user (rejected with 400 if the target user isn't already a `usr`) — so it can't be used to grant Super Admin access or read/write other roles.
- **Unlinking removes the grant, not the user account** — matches the existing `campaignItem`/`activationItem` unlink pattern; the account can be re-linked (here or to another campaign) later.

### Decisions taken (this batch, cont'd)
- **No new dependency** for the searchable dropdown — `SearchableSelect` is a small hand-rolled combobox (text input + filtered menu), consistent with the "no library" calls made for the map/chart in earlier batches. Filters client-side by substring on the already-loaded option list, same approach as the Campaign Products search (#1).
- **Promoter/Supervisor label** is `fullName — employeeId` (falls back to `displayName` if `fullName` missing). Deliberately did **not** filter the Promoter list to `userType: 'promoter'` or Supervisor to `'supervisor'` — both dropdowns already drew from the full unfiltered staff list before this change; narrowing that is a separate, unrequested behavior change.
- **`addDefaults`** is a new, opt-in resource-config hook (parallel to the existing `editValues`) — only `activations` uses it so far; other resources are unaffected.

### Decisions taken
- **Bulk-add UI is checkboxes + one "Add Selected" button**, not a multi-select combobox — matches the existing checkbox pattern already used in `SalesCorrectionGrid.jsx`.
- **Search is plain substring match** on name/SKU, not glob-style wildcards.
- Bulk endpoint reuses the `activationItemsAdd` idempotent-upsert pattern from `activations.routes.ts` (re-adding an already-linked product is a no-op, not a 409).

