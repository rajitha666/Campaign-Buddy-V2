# Campaign Buddy — Backend API Specification

**Version:** 1.0 (draft)
**Scope:** REST API contract needed to power the Campaign Buddy mobile app (sign-in, home, attendance, stats, product/stock updates, sales summary, time off, performance) and its foreground location tracking. Covers request/response shapes, field-level data types, and client-trigger behavior. Written for the backend team to implement against; the mobile team should treat this as the integration contract.

This spec does not cover the browser-based manager/admin console — that is a separate document.

---

## 1. Conventions

| Aspect | Convention |
|---|---|
| Base URL | `https://api.campaignbuddy.app/v1` |
| Format | JSON request/response bodies, `Content-Type: application/json` |
| Auth | Bearer JWT in `Authorization: Bearer <token>` header on every endpoint except `POST /auth/login`, `POST /auth/forgot-password`, `POST /auth/refresh` |
| IDs | UUID v4 strings (`"3f2a1c9e-..."`) unless noted otherwise |
| Date | `YYYY-MM-DD` (e.g. `"2026-09-05"`), campaign/outlet local calendar date |
| Date-time | ISO 8601 UTC with `Z` suffix (e.g. `"2026-09-05T04:19:00Z"`) |
| Currency | Integer, whole LKR (no minor units — the app never shows cents). `86400` = LKR 86,400 |
| Booleans | `true` / `false`, never `0`/`1` |
| Timezone | All local-time calculations (e.g. "day boundary" for daily stats) use the outlet's `timezone` field (IANA, e.g. `"Asia/Colombo"`) |

### 1.1 Response envelope

Success:
```json
{ "data": { ... } }
```
List success:
```json
{ "data": [ ... ], "meta": { "total": 24 } }
```
Error:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "soldToday cannot exceed openingStock",
    "field": "soldToday"
  }
}
```

### 1.2 Standard HTTP status codes

| Code | Meaning |
|---|---|
| 200 | Success (read or update) |
| 201 | Resource created |
| 204 | Success, no body (e.g. location ping ack) |
| 400 | Validation error — see `error.code` |
| 401 | Missing/expired/invalid token |
| 403 | Authenticated but not permitted (e.g. editing another user's attendance) |
| 404 | Resource not found |
| 409 | Conflict (e.g. already checked in, duplicate time-off overlap) |
| 422 | Semantically invalid (e.g. check-out before check-in) |
| 500 | Server error |

### 1.3 Common error codes

`VALIDATION_ERROR`, `NOT_CHECKED_IN`, `ALREADY_CHECKED_IN`, `LOCATION_OUT_OF_RANGE`, `OVERLAPPING_LEAVE_REQUEST`, `INSUFFICIENT_STOCK`, `TOKEN_EXPIRED`, `FORBIDDEN`.

For `VALIDATION_ERROR`, `error.message` is always a plain, user-facing sentence
that names the field (e.g. `"From date is required"`, `"Foot fall must be 0 or
more"`) — safe to show directly in the UI. The raw Zod wording is never sent.
See `src/utils/validationMessages.ts`.

---

## 2. Data Models

### 2.1 User

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUID) | |
| `employeeId` | string | e.g. `"DYR-0142"` — human-readable, shown in Profile |
| `fullName` | string | |
| `displayName` | string | preferred short name; used for the home-screen greeting |
| `username` | string | app login username (mobile number also works — see §3) |
| `phone` | string | E.164 format, e.g. `"+94771234567"` |
| `role` | enum: `field_rep`, `campaign_owner`, `admin` | |
| `avatarInitials` | string | 2 chars, derived server-side from `displayName` (falls back to `fullName`) |
| `reportsToUserId` | string (UUID), nullable | approver for leave requests |
| `reportsToName` | string | denormalized for display without a join |

### 2.2 Campaign

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUID) | |
| `name` | string | e.g. `"Sktest Activation"` |
| `startDate` | date | |
| `endDate` | date | used to compute total campaign days |
| `status` | enum: `upcoming`, `active`, `ended` | |
| `timezone` | string (IANA) | e.g. `"Asia/Colombo"` |

### 2.3 Outlet

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUID) | |
| `name` | string | e.g. `"Nawala Retail Outlet"` |
| `address` | string | |
| `latitude` | number (float) | outlet geofence center |
| `longitude` | number (float) | |
| `geofenceRadiusMeters` | integer | used to validate check-in location, e.g. `150` |

### 2.4 Assignment

Maps a user to a campaign + outlet for a given shift/day. Drives the Home screen's campaign card.

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUID) | |
| `userId` | string (UUID) | |
| `campaignId` | string (UUID) | |
| `outletId` | string (UUID) | |
| `shiftDate` | date | |
| `shiftStart` | date-time, nullable | planned shift start |
| `shiftEnd` | date-time, nullable | planned shift end |

### 2.5 AttendanceRecord

One row per check-in/check-out cycle.

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUID) | |
| `userId` | string (UUID) | |
| `assignmentId` | string (UUID) | |
| `date` | date | local calendar date this record belongs to |
| `checkInAt` | date-time, nullable | |
| `checkInLat` | number (float), nullable | |
| `checkInLng` | number (float), nullable | |
| `checkInLocationVerified` | boolean | true if within `geofenceRadiusMeters` |
| `checkOutAt` | date-time, nullable | |
| `checkOutLat` | number (float), nullable | |
| `checkOutLng` | number (float), nullable | |
| `salesSummaryConfirmedAtCheckout` | boolean | captured from the checkout confirmation popup |
| `status` | enum: `on_time`, `late`, `leave`, `absent`, `pending` | server-computed at check-in vs. `shiftStart` (grace period configurable, e.g. 10 min); `pending` = shift day not yet started; `leave`/`absent` set independently of check-in/out |
| `leaveRequestId` | string (UUID), nullable | set when `status = leave`, links to the approved `TimeOffRequest` |

### 2.6 LocationPing

Lightweight, high-frequency — see §5 for client behavior. Not surfaced in any app screen; consumed by the manager console's live-attendance map (future).

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUID) | |
| `userId` | string (UUID) | |
| `latitude` | number (float) | |
| `longitude` | number (float) | |
| `accuracyMeters` | number (float), nullable | device-reported GPS accuracy |
| `capturedAt` | date-time | client clock, sent by device |
| `receivedAt` | date-time | server clock, set on write |
| `appState` | enum: `foreground`, `background` | should always be `foreground` under the current spec (see §5) |
| `batteryPercent` | integer, nullable | 0–100, optional, best-effort |

### 2.7 DailyStats

One row per `(userId, assignmentId, date)`. Backs the Home stats row and the Update Today's Stats screen.

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUID) | |
| `userId` | string (UUID) | |
| `assignmentId` | string (UUID) | |
| `date` | date | |
| `footFall` | integer | ≥ 0, manually stepped by the rep |
| `approached` | integer | ≥ 0 |
| `converted` | integer | ≥ 0 |
| `totalSales` | integer (LKR) | **read-only, server-computed** — sum of `StockEntry.soldToday × Product.unitPrice` for the day. Never accepted from the client. |
| `updatedAt` | date-time | |

Conversion rate (`converted / approached`) is derived client-side or in the response — see §6.4.

### 2.8 Product

Catalog-level product, shared across campaigns.

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUID) | |
| `sku` | string | e.g. `"TF-320-TT"` |
| `name` | string | e.g. `"Sulfate Free Shampoo — Tea Tree Essential Oil 320ml"` |
| `unitPrice` | integer (LKR) | |
| `imageUrl` | string (URL), nullable | |
| `description` | string | shown in the product-details popup |
| `attributes` | array of string | e.g. `["320ml", "Sulfate-free", "Paraben-free", "Cruelty-free", "Tea tree scent"]` |
| `supplierName` | string | |

### 2.9 CampaignProductAssignment

A product made available in a specific campaign + outlet.

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUID) | |
| `campaignId` | string (UUID) | |
| `outletId` | string (UUID) | |
| `productId` | string (UUID) | |
| `addedToCampaignAt` | date | powers "In this campaign since" in product details |

### 2.10 StockEntry

One row per `(campaignProductAssignmentId, userId, date)` — today's counters for a product at this rep's outlet.

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUID) | |
| `campaignProductAssignmentId` | string (UUID) | |
| `userId` | string (UUID) | |
| `date` | date | |
| `openingStock` | integer | ≥ 0, units received at check-in |
| `soldToday` | integer | ≥ 0, ≤ `openingStock` |
| `otherInterestedCustomers` | integer | ≥ 0 — "asked about it, didn't buy today" |
| `reorderFlag` | boolean | staff-set toggle; surfaces the "Reorder" tag on Home |
| `remainingStock` | integer | **read-only, server-computed** = `openingStock − soldToday` |
| `updatedAt` | date-time | |

### 2.11 SalesSummary

Aggregated per `(userId, assignmentId, date)` — mostly a rollup of `StockEntry` + `DailyStats`, plus the rep's remarks and confirmation state.

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUID) | |
| `userId` | string (UUID) | |
| `assignmentId` | string (UUID) | |
| `date` | date | |
| `itemsReceived` | integer | read-only, = Σ `StockEntry.openingStock` |
| `itemsSold` | integer | read-only, = Σ `StockEntry.soldToday` |
| `itemsRemaining` | integer | read-only, = Σ `StockEntry.remainingStock` |
| `totalSales` | integer (LKR) | read-only, same value as `DailyStats.totalSales` |
| `footFall` | integer | read-only, mirrors `DailyStats.footFall` |
| `approached` | integer | read-only, mirrors `DailyStats.approached` |
| `converted` | integer | read-only, mirrors `DailyStats.converted` |
| `remarks` | string, nullable | free text, rep-entered |
| `confirmed` | boolean | set `true` by `POST /sales-summary/today/confirm` |
| `confirmedAt` | date-time, nullable | |

### 2.12 TimeOffRequest

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUID) | |
| `userId` | string (UUID) | |
| `fromDate` | date | |
| `toDate` | date | |
| `days` | integer | read-only, server-computed inclusive day count |
| `reason` | enum: `sick_leave`, `annual_leave`, `personal`, `other` | |
| `note` | string, nullable | optional note to approver |
| `status` | enum: `pending`, `approved`, `declined` | |
| `approverId` | string (UUID) | defaults to `User.reportsToUserId` at creation time |
| `approverName` | string | denormalized |
| `createdAt` | date-time | |
| `decidedAt` | date-time, nullable | |

### 2.14 CustomSalesField (issue #13)

Admin-defined extra field on the daily sales update, configured per campaign in
the portal. The mobile app only reads definitions and reads/writes values.

| Field | Type | Notes |
|---|---|---|
| `key` | string | stable slug (e.g. `competitor_promo`) — use as the map key when writing values |
| `label` | string | display label |
| `type` | enum: `number`, `text`, `boolean`, `select` | |
| `scope` | enum: `day`, `product` | `day` → one value per assignment per day; `product` → one per product per day |
| `options` | string[] | `select` only, in display order |
| `required` | boolean | a required `day` field blocks `POST /sales-summary/today/confirm`; a required `product` field blocks that product's stock `PATCH` |
| `value` | number \| boolean \| string \| null | present on read; typed per `type` (`null` = unset) |

### 2.13 PerformanceSummary (computed, response-only — no table)

See `GET /campaigns/{campaignId}/performance` in §6.9 for shape.

---

## 3. Auth

### `POST /auth/login`
**Request**
```json
{ "username": "0771234567", "password": "••••••••" }
```
| Field | Type | Required |
|---|---|---|
| `username` | string | yes — the staff member's **mobile number** (any common Sri Lankan format: `0771234567`, `771234567`, `+94771234567`) **or** their legacy app username |
| `password` | string | yes |

The mobile number is matched after normalizing to E.164. A number that maps to
more than one staff member is treated as invalid credentials.

**Response `200`**
```json
{
  "data": {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "8f3d2e...",
    "expiresIn": 3600,
    "user": { "id": "...", "fullName": "Sanduni Kumari", "role": "field_rep", "...": "..." }
  }
}
```
**Errors:** `401` invalid credentials.

### `POST /auth/refresh`
**Request:** `{ "refreshToken": "..." }` → **Response:** new `accessToken` + `expiresIn`.

### `POST /auth/forgot-password`
**Request:** `{ "username": "0771234567" }` (mobile number or username) → **Response `200`**, always generic (`"If the account exists, a reset link was sent"`) to avoid user enumeration.

### `POST /auth/logout`
Invalidates the current refresh token. **Response `204`.**

---

## 4. Profile

### `GET /me`
**Response `200`**
```json
{
  "data": {
    "id": "u_123",
    "employeeId": "DYR-0142",
    "fullName": "Sanduni Kumari",
    "phone": "+94771234567",
    "role": "field_rep",
    "reportsToName": "Neel Dharmapriya"
  }
}
```

### `GET /me/assignments/today`
Drives the Home campaign card. **Response `200`**
```json
{
  "data": {
    "assignmentId": "a_55",
    "campaign": { "id": "c_9", "name": "Sktest Activation", "startDate": "2026-09-01" },
    "outlet": { "id": "o_2", "name": "Nawala Retail Outlet", "latitude": 6.8845, "longitude": 79.8887, "geofenceRadiusMeters": 150 },
    "shiftStart": "2026-09-05T03:30:00Z",
    "shiftEnd": "2026-09-05T12:30:00Z"
  }
}
```

---

## 5. Attendance & Location

### `GET /attendance/today`
**Response `200`**
```json
{
  "data": {
    "checkedIn": true,
    "checkInAt": "2026-09-05T04:19:00Z",
    "checkOutAt": null,
    "shiftDurationSeconds": 13320,
    "locationVerified": true,
    "status": "on_time"
  }
}
```

### `POST /attendance/check-in`
**Request**
```json
{ "assignmentId": "a_55", "latitude": 6.8846, "longitude": 79.8889, "timestamp": "2026-09-05T04:19:00Z" }
```
| Field | Type | Required |
|---|---|---|
| `assignmentId` | string (UUID) | yes |
| `latitude` | number | yes |
| `longitude` | number | yes |
| `timestamp` | date-time | yes — device clock |

Server computes `checkInLocationVerified` (haversine distance vs. outlet ≤ `geofenceRadiusMeters`) and `status` (`on_time` vs `late`, vs. `shiftStart` + grace period).
**Response `201`** → the created `AttendanceRecord`.
**Errors:** `409 ALREADY_CHECKED_IN`.

### `POST /attendance/check-out`
**Request**
```json
{
  "latitude": 6.8845,
  "longitude": 79.8887,
  "timestamp": "2026-09-05T12:34:00Z",
  "salesSummaryConfirmed": true
}
```
| Field | Type | Required | Notes |
|---|---|---|---|
| `latitude` | number | yes | |
| `longitude` | number | yes | |
| `timestamp` | date-time | yes | |
| `salesSummaryConfirmed` | boolean | yes | `true` if the rep tapped **"Yes, check out"** on the confirm popup; `false` is not a valid submission — if the rep taps **"No, confirm sales summary"**, the client does not call this endpoint yet, it navigates to `POST /sales-summary/today/confirm` first, then re-attempts checkout |

**Response `200`** → updated `AttendanceRecord`.
**Errors:** `422 NOT_CHECKED_IN` if no open check-in exists.

### `GET /attendance/history?range=week`
**Response `200`**
```json
{
  "data": [
    { "date": "2026-09-05", "checkInAt": "2026-09-05T04:19:00Z", "checkOutAt": null, "status": "on_time" },
    { "date": "2026-09-02", "checkInAt": null, "checkOutAt": null, "status": "leave", "leaveReason": "sick_leave" }
  ]
}
```
`range` query param: `week` (default) or `month`.

### `POST /location/ping`  — foreground location tracking (while checked in)

**Trigger (client behavior, not server-enforced):** the app sends this while it is in the **foreground** *and* the rep currently has an open check-in (i.e. between `POST /attendance/check-in` and `POST /attendance/check-out`). Recommended:
- Start sending immediately on a successful check-in.
- Every **60 seconds** while the app is in the foreground and still checked in.
- Immediately once when the app transitions from background → foreground, if still checked in.
- Debounced/skipped if location hasn't changed by more than ~10 meters since the last successful ping (saves battery/bandwidth), except the interval max above still applies as a heartbeat.
- **Stop sending** the moment any of these happen: the app is backgrounded, the device is locked, or the rep checks out. Backgrounding does not end the shift, but it does pause pings until the app is foregrounded again (still checked in) — this is foreground-only tracking, not a background location service.
- No pings are sent at all outside a check-in/check-out window (e.g. before the shift starts, or after checkout, even if the app is open).

**Request**
```json
{
  "latitude": 6.8846,
  "longitude": 79.8889,
  "accuracyMeters": 12.4,
  "timestamp": "2026-09-05T04:22:00Z",
  "batteryPercent": 71
}
```
| Field | Type | Required | Notes |
|---|---|---|---|
| `latitude` | number | yes | |
| `longitude` | number | yes | |
| `accuracyMeters` | number | no | |
| `timestamp` | date-time | yes | device clock |
| `batteryPercent` | integer | no | 0–100 |

**Response `204`** (no body). Fire-and-forget from the client; failures should be silently retried on the next interval tick, not surfaced to the user.
**Errors:** `422 NOT_CHECKED_IN` if the user has no open `AttendanceRecord` (no `checkInAt` without a matching `checkOutAt`) — the server should reject pings outside a shift rather than relying on client behavior alone, since a client bug or stale timer could otherwise keep sending after checkout.

---

## 6. Daily Stats, Products & Stock, Sales Summary

### 6.1 `GET /stats/today`
**Response `200`**
```json
{
  "data": {
    "footFall": 12,
    "approached": 20,
    "converted": 11,
    "conversionRate": 0.55,
    "totalSales": 86400
  }
}
```

### 6.2 `PATCH /stats/today`
Used by the Update Today's Stats screen. Client sends the **final absolute value** for whichever fields the rep changed with the +/− steppers (not deltas).

**Request** (all fields optional — send only what changed)
```json
{ "footFall": 13, "approached": 21, "converted": 12 }
```
**Response `200`** → full updated `DailyStats` object (see §2.7).

### 6.3 `GET /campaigns/{campaignId}/outlets/{outletId}/products`
Backs both the Home embedded list and the full Campaign product list. **Response `200`**
```json
{
  "data": [
    {
      "campaignProductAssignmentId": "cpa_1",
      "product": { "id": "p_1", "sku": "LV-320-LA", "name": "Sulfate Free Shampoo — Lavender 320ml", "unitPrice": 3200, "imageUrl": null },
      "openingStock": 12,
      "soldToday": 0,
      "remainingStock": 12,
      "reorderFlag": false
    },
    {
      "campaignProductAssignmentId": "cpa_2",
      "product": { "id": "p_2", "sku": "TF-320-TT", "name": "Sulfate Free Shampoo — Tea Tree Essential Oil 320ml", "unitPrice": 3200, "imageUrl": null },
      "openingStock": 12,
      "soldToday": 9,
      "remainingStock": 3,
      "reorderFlag": true
    }
  ]
}
```
Each row also carries `customFields` — an array of the campaign's product-scope custom fields (§2.14) with this product's current values.
Optional query param `reorderOnly=true` filters to `reorderFlag = true` (powers the "Reorder only" toggle on the Campaign list screen).

### 6.4 `GET /products/{productId}`
Backs the product-details popup. **Response `200`**
```json
{
  "data": {
    "id": "p_2",
    "sku": "TF-320-TT",
    "name": "Sulfate Free Shampoo — Tea Tree Essential Oil 320ml",
    "unitPrice": 3200,
    "description": "A gentle, sulfate-free formula infused with tea tree essential oil...",
    "attributes": ["320ml", "Sulfate-free", "Paraben-free", "Cruelty-free", "Tea tree scent"],
    "supplierName": "Prisha Naturals",
    "addedToCampaignAt": "2026-09-03",
    "soldAcrossAllOutletsToday": 64
  }
}
```
`soldAcrossAllOutletsToday` is a cross-outlet rollup for the current campaign day — computed server-side, not stored on `Product`.

### 6.5 `PATCH /products/{campaignProductAssignmentId}/stock`
Updates today's `StockEntry` for this rep. All fields optional — send only what changed (matches the steppers/toggle on the product screen).

**Request**
```json
{ "openingStock": 12, "soldToday": 10, "otherInterestedCustomers": 5, "reorderFlag": true }
```
| Field | Type | Required |
|---|---|---|
| `openingStock` | integer, ≥ 0 | no |
| `soldToday` | integer, ≥ 0, ≤ `openingStock` | no |
| `otherInterestedCustomers` | integer, ≥ 0 | no |
| `reorderFlag` | boolean | no |

| `customFields` | object `{ <key>: value \| null }` | no — product-scope custom fields (§2.14); `null` clears one |

**Response `200`** → updated `StockEntry` (includes server-computed `remainingStock` and `customFields`).
**Errors:** `400 VALIDATION_ERROR` if `soldToday > openingStock` or a custom value doesn't match its type; `422 MISSING_REQUIRED_FIELD` (with `field: <key>`) if a required product field would be left empty.

> Note: updating `soldToday` here is what changes `DailyStats.totalSales` — the server recalculates the sum across all of the rep's `StockEntry` rows for the day whenever any one of them changes.

### 6.6 `GET /sales-summary/today`
**Response `200`** → full `SalesSummary` object (§2.11), including `remarks`, `confirmed`, and `customFields` (array of day-scope §2.14 fields with values).

### 6.7 `PATCH /sales-summary/today`
**Request:** `{ "remarks": "Slow foot fall after 4pm due to rain", "customFields": { "weather": "Rain", "samples_given": 12 } }` — both fields optional; a `null` value clears that custom field.
**Response `200`** → updated `SalesSummary`.
**Errors:** `400` if a custom value doesn't match its type; `409 SUMMARY_CONFIRMED` once the day is confirmed (promoter is locked out — admin corrects via the portal).

### 6.8 `POST /sales-summary/today/confirm`
Marks today confirmed — this is the action the "No, confirm sales summary" path in the checkout popup ultimately drives, and also what the **Confirm & submit** button on the Sales page calls directly.
**Request:** `{}` (or `{ "remarks": "...", "customFields": { ... } }` to save in the same call)
**Response `200`** → `SalesSummary` with `confirmed: true`, `confirmedAt` set.
**Errors:** `409` if already confirmed (idempotent — treat as success on the client); `422 MISSING_REQUIRED_FIELD` (with `field: <key>`) if a required day-scope custom field is still empty.

### 6.9 `GET /sales-fields`
The custom fields configured for the promoter's current campaign (§2.14). Returns `{ "data": { "day": [...], "product": [...] } }`; `day` entries carry today's `value`, `product` entries are definitions only (values come with each product in §6.3). Empty lists when there's no assignment today.

---

## 7. Time Off

### `GET /time-off/balance`
**Response `200`**
```json
{ "data": { "pendingCount": 1, "takenThisYear": 3 } }
```
(Note: "Days remaining" was intentionally removed from the product — do not add an annual-allowance field unless the product brings it back.)

### `GET /time-off/requests`
**Response `200`** → array of `TimeOffRequest` (§2.12), newest first.

### `POST /time-off/requests`
**Request**
```json
{
  "fromDate": "2026-09-08",
  "toDate": "2026-09-09",
  "reason": "sick_leave",
  "note": ""
}
```
| Field | Type | Required |
|---|---|---|
| `fromDate` | date | yes |
| `toDate` | date | yes, ≥ `fromDate` |
| `reason` | enum (§2.12) | yes |
| `note` | string | no |

**Response `201`** → created `TimeOffRequest`, `status: "pending"`.
**Errors:** `409 OVERLAPPING_LEAVE_REQUEST` if dates overlap an existing pending/approved request.

---

## 8. Performance

### `GET /campaigns/{campaignId}/performance?outletId={outletId}`
Backs the Performance tab. Aggregates across the full campaign-to-date for this rep's outlet.

**Response `200`**
```json
{
  "data": {
    "campaignName": "Sktest Activation",
    "startDate": "2026-09-01",
    "dayNumber": 5,
    "totalDays": 14,
    "totalSales": 412400,
    "totalUnitsSold": 142,
    "totalApproached": 96,
    "dailySales": [
      { "date": "2026-09-01", "amount": 68000 },
      { "date": "2026-09-02", "amount": 74000 },
      { "date": "2026-09-03", "amount": 91000 },
      { "date": "2026-09-04", "amount": 93000 },
      { "date": "2026-09-05", "amount": 86400 }
    ],
    "topProducts": [
      { "productId": "p_2", "name": "Sulfate Free Shampoo — Tea Tree 320ml", "unitPrice": 3200, "unitsSold": 61 },
      { "productId": "p_1", "name": "Sulfate Free Shampoo — Lavender 320ml", "unitPrice": 3200, "unitsSold": 47 },
      { "productId": "p_3", "name": "Sulfate Free Shampoo — Aloe Vera 320ml", "unitPrice": 3200, "unitsSold": 34 }
    ]
  }
}
```
`dayNumber` = inclusive count of calendar days from `startDate` to "today" in the outlet's timezone. `topProducts` is sorted `unitsSold` descending — this ordering is server-side, not a client sort.

---

## 9. Endpoint summary

| Method | Path | Screen |
|---|---|---|
| POST | `/auth/login` | Login |
| POST | `/auth/forgot-password` | Login |
| POST | `/auth/refresh` | (silent) |
| POST | `/auth/logout` | Profile |
| GET | `/me` | Profile |
| GET | `/me/assignments/today` | Home |
| GET | `/attendance/today` | Home, Attendance |
| POST | `/attendance/check-in` | Attendance (pre-shift) |
| POST | `/attendance/check-out` | Attendance (checkout popup) |
| GET | `/attendance/history` | Attendance (This week list) |
| POST | `/location/ping` | Background behavior, while checked in only |
| GET | `/stats/today` | Home (compact stats row) |
| PATCH | `/stats/today` | Update Today's Stats |
| GET | `/campaigns/{id}/outlets/{id}/products` | Home product list, Campaign product list |
| GET | `/products/{id}` | Product details popup |
| PATCH | `/products/{cpaId}/stock` | Update Stock (steppers + reorder toggle) |
| GET | `/sales-summary/today` | Sales page |
| PATCH | `/sales-summary/today` | Sales page (remarks) |
| POST | `/sales-summary/today/confirm` | Sales page (Confirm & submit), Checkout popup |
| GET | `/time-off/balance` | Time off |
| GET | `/time-off/requests` | Time off |
| POST | `/time-off/requests` | New time off request popup |
| GET | `/campaigns/{id}/performance` | Performance |

---

## 10. Assumptions to confirm with product

1. **Geofence radius & late-arrival grace period** are configurable per outlet/campaign, not hardcoded — defaults assumed above (150m, 10 min) need sign-off.
2. **`totalSales` is always server-computed** from stock entries; the client never sends a sales figure directly. Confirm this matches intended business logic (i.e. price × units sold, no discounts/tax layer yet).
3. **Location ping is scoped to an open shift** — the client only sends pings between check-in and check-out while the app is foregrounded, and the server enforces this by rejecting pings with no open `AttendanceRecord`. Confirmed with product; no longer an open question.
4. **Time-off annual allowance** ("Days remaining") is out of scope since it was removed from the UI — confirm nothing downstream (e.g. payroll) still expects it.
5. **Performance scope** is per-outlet for the logged-in rep, not campaign-wide across all outlets — confirm this matches what the mobile Performance tab should show versus a future manager-level rollup.
