# Archive sales records — design spec

Admin can archive (soft-delete) individual sales records from the portal **Update
Sales** screen (`/sales/update`). Archived records are excluded from every
calculation and report; if the promoter later re-enters stock for the same
product/day, the app updates the existing row and unarchives it (live data wins).

## Decisions

| # | Decision | Choice |
|---|---|---|
| A1 | Delete kind | **Soft delete** — `archivedAt` flag on the row; data kept in DB for audit. No restore-redundancy slots. |
| A2 | Where | Portal **Update Sales** grid only (the `SalesCorrectionGrid` component) |
| A3 | Bulk vs per-row | **Per row** — checkboxes and the bulk "Save corrections" button are removed; each row gets Update / Archive / Unarchive buttons |
| A4 | Archived visibility in grid | **Kept, muted** with an "Archived" badge — mistakes are recoverable, nothing is hidden without trace |
| A5 | Re-entry by promoter | `PATCH /v1 …/products/:id/stock` upsert **updates the existing row and clears `archivedAt`** — the (item, date) unique key is untouched, so no schema gymnastics is needed |
| A6 | Admin correction on archived row | **Refused (400 VALIDATION_ERROR, codebase convention)** — the row is excluded from sales numbers; restore it first, then correct |
| A7 | Exclusion scope | Every sales-record read feeding totals: dashboard totals, reports, target progress, staff evaluation, the sales list, `SalesSummary` rollups, and the app's own stats/performance/stock screens |
| A8 | Sales-related data NOT archived with the record | `SalesFieldValue` custom fields and `DailyStats` (footfall / approached / converted) are separate records and stay as they are — archived only means "this day's stock/sold numbers don't count" |
| A9 | Confirming flows | Archive/restore require portal user role `adm` or `usr` (same as sales correction), campaign access, and the outlet guard |
| A10 | MCP exposure | **Excluded** — "Deletes are never exposed to an LLM" (recorded in `campaign-buddy-mcp/coverage.json`) |

## Data model

```prisma
model SalesRecord {
  // existing fields unchanged
  archivedAt DateTime?
  // @@unique([activationItemId, date]) stays — at most ONE row per
  // activation-item per day, archived or not. Archiving only flags the row;
  // the promoter's next stock entry updates the same row (and unarchives it).
}
```

Migration: `add_sales_record_archived_at` (`ALTER TABLE sales_records ADD COLUMN
"archivedAt" TIMESTAMP(3)`); no other tables touched.

## Backend (`campaign-buddy-backend`)

### New endpoints — `src/modules/admin/operations.routes.ts`

- `DELETE /admin/v1/campaigns/:campaignId/sales/:salesRecordId` — archive.
  Guards: `requireCampaignAccess`, `requireRole("adm", "usr")`,
  `assertOutletAllowed` (via the record's activation). The record must exist,
  match the campaign through `activationItem → activation`, and be live
  (`archivedAt` null) — otherwise `notFound`. Sets `archivedAt = now()`.
  Mirrors the supervisor-routes soft-delete response shape
  (`{ ...existing, archivedAt, softDeleted: true }`).
- `POST /admin/v1/campaigns/:campaignId/sales/:salesRecordId/restore` —
  unarchive. Same guards; 404 unless the row is archived; clears `archivedAt`.

### Changed semantics

- `PATCH /campaigns/:campaignId/sales/:salesRecordId` (correction): a fetched
  row that is archived → `validationError` (400, "restore it first").
- `GET …/sales/lookup`: rows keep their single record (live or archived); the
  row gains `archived: true` + `archivedAt` so the grid can render the muted
  state. Values of the sole (archived) record are still returned — that is what
  the muted row displays.
- `GET …/campaigns/:campaignId/sales` (list): `archivedAt: null` in the where —
  archived rows drop out of the portal's recent-sales list and the MCP
  `get_sales_records` read.

### Exclusion filter sweep (`archivedAt: null` added to every sales read)

| File | Sites |
|---|---|
| `src/utils/salesCalc.ts` | `computeTotalSales`, `buildSalesSummary` (dashboard, promoter summary rollups) |
| `src/modules/admin/targetProgress.ts` | target achieved math |
| `src/modules/admin/reports.routes.ts` | sku-wise, brand-wise, outlet-wise, starting-stock, reorder, sales-status reads |
| `src/modules/admin/staff.routes.ts` | staff evaluation sales history |
| `src/modules/mobile/stats.routes.ts` | daily stats / sales rollup |
| `src/modules/mobile/performance.routes.ts` | promoter performance |
| `src/modules/mobile/products.routes.ts` | stock-screen includes (`:36`, `:86`) — archived → app shows blanks; upsert `update` branch gains `archivedAt: null` so re-entry updates + unarchives the row |

Net effect: archived rows disappear from every total; a promoter re-entering
stock for the same product/day revives it with their fresh values.

### Promoter re-entry flow (A5)

1. Admin archives the day's record (wrong data).
2. Reports/dashboards/app totals drop; the app's stock screen shows blanks for
   that product (no live record).
3. Promoter saves opening stock / sold qty on mobile → upsert finds the
   unique (activationItemId, date) row, overwrites the values, sets
   `archivedAt = null`, snapshotting `startingStock` on what is effectively a
   fresh entry (shift rules unchanged).
4. The record is live again and included in every calculation from then on.

## Portal (`campaign-buddy-portal`)

### `src/components/SalesCorrectionGrid.jsx`

- **Removed**: the row checkbox column and the bulk "Save corrections" button.
- Per-row controls in a new Actions column:
  - any live row → **Update** — a row with an existing record saves via `PATCH`; a row
    the promoter never submitted (`id: null` zeros row) is **created** via
    `POST …/sales` (`{activationItemId, date, openingStock, soldToday}`) and
    the row is patched in place with its new id. `soldToday ≤ openingStock` is
    checked client-side
    too; `salesCreate` differences: the DB unique `(activationItemId, date)`
    key makes a double-create a 409 (`ALREADY_EXISTS`).
  - rows with an existing record → **Archive** (confirm dialog: "Archive this
    sales record? It will be excluded from all totals and reports.")
  - archived record → muted row (no badge), **Unarchive** (confirm dialog),
    no Update/Archive.
  - no record yet → zeros, Update only (creates the record).
- Per-row action buttons always render with irrelevant ones
  `visibility: hidden` and rows are patched in place after every action —
  the grid never reloads, so update/archive/unarchive move nothing.
- Inline per-row feedback: after Update / Archive / Unarchive a small tick
  (`✓`, or `!` in red on error) appears **beside the product name** for ~4 s,
  then disappears; the slot is a fixed-width reserved span so the tick does
  not shift the row or the table. Keyed by `activationItemId` so it survives
  in-place row updates (errors also stay in the global toast until dismissed).
- Day-level custom fields panel gets its own **Save daily fields** button
  (previously bundled with the bulk save; same `PUT …/sales/custom-values`).
- CSV export skips archived rows.
- `src/pages/UpdateSales.jsx`: the developer hint-note (endpoint list) was
  removed from the page — API details don't belong on a user-facing screen.
- `salesRecords` endpoint map (`src/lib/endpoints.js`) gains `create()`,
  `archive()` and `restore()`.

## Tests

- Backend `test/salesArchive.test.ts`:
  - archive → row excluded from `GET …/sales`, and report/summary rollups;
    lookup returns it flagged `archived: true`;
  - second archive → 404; restore → visible again everywhere; double restore
    → 404; `sup` role → 403;
  - mobile stock re-entry after archive → same row updated, `archivedAt`
    cleared, counted in totals again;
  - PATCH correction on an archived row → 400.
- Portal `SalesCorrectionGrid.test.js` / `UpdateSales.test.js`: per-row button
  texts, confirm prompts, absence of the removed checkbox/`Save corrections`
  strings (existing text-match style).

## Housekeeping

- `campaign-buddy-mcp/coverage.json` — exclusion entries for the two new
  routes (required by the deterministic CI coverage gate:
  `test/coverage.test.ts` fails on unmapped `/admin/v1` routes).
- `marketing/training/admin.html` — task 11 "Correct a promoter's sales"
  rewritten: per-row Update / Archive / Unarchive flow instead of tick +
  Save corrections. Screenshot `assets/portal-admin/24-sales-update.webp`
  goes stale — swap in place later while keeping the filename.
- `docs/backend-spec.md` + `docs/admin-panel-spec.md` — endpoint + screen
  notes.
