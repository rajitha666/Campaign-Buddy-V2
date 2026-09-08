# Custom Sales Fields — design spec (issue #13)

Admin-defined extra data fields captured on the daily sales update, alongside the
standard opening-stock / sold-qty data.

## Decisions

| # | Decision | Choice |
|---|---|---|
| D1 | Granularity | **Both** — each field is *day-level* (one value per activation per day) **or** *product-level* (one value per activation-item per day) |
| D2 | Definition scope | **Per campaign** |
| D3 | Field types | `number`, `text`, `boolean` (Yes/No), `select` (admin-defined options) |
| D4 | Required | Admin can mark a field required; a missing required **day** field blocks the promoter's *Confirm & submit*, a missing required **product** field blocks that product's stock save. Portal admin saves are never blocked. |
| D5 | Capture surfaces | Mobile (primary) + portal (admin correction) |
| D6 | Locking | Once the day's `SalesSummary.confirmed` is true the promoter can't edit day-level values; admin/supervisor always can. Product-level values follow the existing stock rules (not locked by confirm). |
| D7 | Reporting (v1) | Portal Sales page load-a-day view · CSV export columns · Last 7 Days panel (day-level) |
| D8 | Deleting a used field | Soft-delete (`archivedAt`): drops off entry forms, values kept & still shown in history/export. Hard delete only when the field has zero values (else 409). |
| D9 | Field key | Auto-slugged from the label at creation, then frozen. Label stays editable. |
| D10 | Naming | "Custom Sales Fields", admin nav under **Sales**, route `/sales/custom-fields` |
| D11 | Product-level target | Applies to every product in the activation |

## Data model

```prisma
enum SalesFieldType   { number text boolean select }
enum SalesFieldScope  { day product }

model SalesFieldDefinition {
  id         String          @id @default(uuid())
  campaignId String
  key        String           // slug, frozen after create; unique per campaign
  label      String
  type       SalesFieldType
  scope      SalesFieldScope  @default(day)
  options    String[]         @default([])   // select only, ordered
  required   Boolean          @default(false)
  sortOrder  Int              @default(0)
  archivedAt DateTime?
  createdAt  DateTime         @default(now())
  updatedAt  DateTime         @updatedAt

  campaign Campaign          @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  values   SalesFieldValue[]

  @@unique([campaignId, key])
  @@index([campaignId])
  @@map("sales_field_definitions")
}

model SalesFieldValue {
  id               String   @id @default(uuid())
  definitionId     String
  activationId     String
  activationItemId String?              // null = day-level, set = product-level
  date             DateTime @db.Date
  value            String               // canonical string, cast per type on read
  updatedAt        DateTime @updatedAt

  definition     SalesFieldDefinition @relation(fields: [definitionId], references: [id], onDelete: Cascade)
  activation     Activation           @relation(fields: [activationId], references: [id], onDelete: Cascade)
  activationItem ActivationItem?      @relation(fields: [activationItemId], references: [id], onDelete: Cascade)

  @@index([activationId, date])
  @@index([definitionId])
  @@map("sales_field_values")
}
```

Uniqueness is enforced by two **partial unique indexes** added in the migration
(Prisma can't express them):

```sql
CREATE UNIQUE INDEX sales_field_values_day_uq
  ON sales_field_values (definition_id, activation_id, date)
  WHERE activation_item_id IS NULL;
CREATE UNIQUE INDEX sales_field_values_product_uq
  ON sales_field_values (definition_id, activation_item_id, date)
  WHERE activation_item_id IS NOT NULL;
```

Writes replace the whole set for a (scope, activation/item, date) in a transaction
(`deleteMany` + `createMany`), so no upsert-by-unique is needed.

### Value encoding

| type | stored `value` | read as |
|---|---|---|
| number | `"12"` / `"3.5"` | number |
| text | free string (≤ 2000 chars) | string |
| boolean | `"true"` / `"false"` | boolean |
| select | the chosen option string (must be in `options`) | string |

Empty / unset ⇒ no `SalesFieldValue` row.

## API

### Admin — definitions (`requireCampaignAccess`, writes `adm`/`usr`)

| Method | Path | Body / notes |
|---|---|---|
| GET | `/admin/v1/campaigns/:campaignId/sales-fields` | `?includeArchived=1` optional; ordered by `sortOrder, createdAt` |
| POST | `/admin/v1/campaigns/:campaignId/sales-fields` | `{ label, type, scope, options?, required?, sortOrder? }` → key auto-slugged, 409 on key clash |
| PATCH | `/admin/v1/campaigns/:campaignId/sales-fields/:id` | `{ label?, options?, required?, sortOrder?, archived? }`. `type`/`scope` editable only while the field has no values. |
| DELETE | `/admin/v1/campaigns/:campaignId/sales-fields/:id` | 204 if unused, else 409 `IN_USE` |

### Admin — values

- `GET /admin/v1/campaigns/:campaignId/sales/lookup` gains `dayFields` + per-row `productFields` (definition + current value).
- `PUT /admin/v1/campaigns/:campaignId/sales/custom-values`
  `{ activationId, date, day: { <key>: <value|null> }, products: { <activationItemId>: { <key>: <value|null> } } }`

### Mobile

- `GET /v1/sales-fields` → `{ day: Def[], product: Def[] }` for the promoter's current activation's campaign (non-archived only).
- `GET /v1/sales-summary/today` gains `customFields: Array<Def & { value: string | null }>` (day scope).
- `PATCH /v1/sales-summary/today` accepts `customFields?: { <key>: <value|null> }`.
- `POST /v1/sales-summary/today/confirm` → 422 `MISSING_REQUIRED_FIELD` if a required day field is empty.
- Campaign-products list items + `GET /v1/products/:cpaId` gain `customFields` (product scope, with value).
- `PATCH /v1/products/:cpaId/stock` accepts `customFields?: { <key>: <value|null> }`; 422 if a required product field is empty.

All value writes validate against the definition's type (number parses, select in options, boolean in {true,false}, text length) → 400 `VALIDATION_ERROR` with `field: "<key>"`.

## UI

### Portal — `/sales/custom-fields` (admin, campaign-scoped) — bespoke `CustomSalesFields.jsx`
Table of definitions (Label · Applies to · Type · Required · Order · Status) + Add/Edit drawer:
Label, Applies to (Whole day / Each product), Type (Number/Text/Yes-No/Dropdown),
Options (one per line, shown only for Dropdown), Required (Yes/No), Sort order.
Edit locks Type/Applies-to once values exist. Archive / Restore / Delete actions.

### Portal — Sales page (`SalesPage.jsx` + `UpdateSales.jsx`)
On *Load sales*: render day-level fields as inputs above the product table; add one
column per product-level field in the table. *Save corrections* also `PUT`s custom
values. Last 7 Days panel lists day-level values per day. CSV export gains columns
(`day:<key>` and `<key>` per product row).

### Mobile
- `SalesSummaryScreen.tsx` — day-level fields below Remarks, disabled when `confirmed`. Sent on confirm (and on the existing remarks PATCH).
- `ProductUpdateScreen.tsx` — product-level fields as extra rows, saved with the stock PATCH.
- New `CustomFieldInput` component: number → numeric `TextInput`, text → `TextInput`, boolean → `ToggleSwitch`, select → tap-to-cycle chips / simple modal list.

## Build order (branch `custom-sales-fields`, commit per layer) — all shipped

1. ✅ schema + migration (2 partial unique indexes) + seed sample fields
2. ✅ backend admin CRUD (`salesFields.routes.ts`) + zod schemas + tests
3. ✅ backend mobile `GET /v1/sales-fields`, sales-summary / products / confirm / stock wiring + required-checks + tests
4. ✅ portal admin page `CustomSalesFields.jsx` + nav + `endpoints.js`
5. ✅ portal `SalesCorrectionGrid` (shared by SalesPage + UpdateSales) + CSV + Last 7 Days + `GET …/sales-field-values`
6. ✅ mobile `CustomFieldInput` + `SalesSummaryScreen` (day) + `ProductUpdateScreen` (product)
7. ✅ docs — api-spec §2.14/§6, backend-spec §2/§4, admin-panel-spec §3.6.5, app README

### Known follow-ups (not in this pass)
- Reports pages (SKU-wise / brand-wise) don't surface custom values yet — only the Sales page, CSV and Last-7-Days panel do.
- `@db.Date` key: mobile writes use local start-of-day (matches the existing SalesRecord/DailyStats convention); on a non-UTC server this can differ from the admin route's UTC-midnight key. Pre-existing across the codebase — not introduced here.
- Product-scope values are not locked by `SalesSummary.confirmed` (they follow the existing stock rules, which aren't either).
