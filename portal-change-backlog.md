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

## Batch 2 — (add new requests below)
