# Campaign Buddy — Backend Specification (v2, implementation-accurate)

**Status:** Matches the implemented backend (Node.js/TypeScript + Express + PostgreSQL/Prisma) as of this document's date. This supersedes `CampaignBuddy_Unified_Backend_Spec.md` (v1, design-stage) and the data-model section of `CampaignBuddy_API_Spec.md` — those documents captured the *intended* design; this one captures what was actually built, field-for-field and endpoint-for-endpoint, so future work stays consistent with the running code.

**Stack:** Node.js, TypeScript, Express, PostgreSQL, Prisma ORM. JWT auth (two independent token spaces — see §3). bcrypt password hashing.

**Serves three client surfaces from one codebase:**
1. **Mobile app** (`/v1/*`) — field Staff (promoters/supervisors), JWT-authenticated, self-scoped.
2. **Admin portal** (`/admin/v1/*`) — campaign setup, staff/activation management, corrections. Full CRUD.
3. **Supervisor & Sponsor portals** — the *same* `/admin/v1/*` API as Admin, gated to read-only and scoped to specific campaigns/outlets via role + access grant. Not separate namespaces or separate backends.

---

## 1. Conventions

| Aspect | Convention |
|---|---|
| Base URLs | `/v1` (mobile), `/admin/v1` (web portal — Admin/Supervisor/Sponsor) |
| Format | JSON, `Content-Type: application/json` |
| IDs | UUID v4 strings, Prisma `@default(uuid())` |
| Currency | Integer, whole LKR (`unitPrice`, `totalSales`, etc. — no decimals) |
| Dates | Plain calendar dates (`AttendanceRecord.date`, `SalesRecord.date`, etc.) stored as Postgres `DATE` (`@db.Date` in Prisma) — no time component |
| Date-times | ISO 8601, stored as Postgres `TIMESTAMP` |
| Auth headers | `Authorization: Bearer <token>` on every route except `/v1/auth/login`, `/v1/auth/refresh`, `/v1/auth/forgot-password`, `/admin/v1/auth/login` |

### 1.1 Response envelope

Success: `{ "data": { ... } }`
List success: `{ "data": [ ... ], "meta": { "total": N } }`
Error:
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "field": "soldToday" } }
```
`field` is omitted when not applicable. Implemented via `ApiError` (`src/utils/apiResponse.ts`) and the central `errorHandler` middleware — every route handler is wrapped in `asyncHandler` so thrown `ApiError`s are caught and formatted consistently; anything else becomes a generic `500 SERVER_ERROR`.

### 1.2 HTTP status codes in use

| Code | Meaning |
|---|---|
| 200 | Success (read or update) |
| 201 | Resource created |
| 204 | Success, no body (e.g. logout, location ping ack) |
| 400 | `VALIDATION_ERROR` — missing/invalid input |
| 401 | `TOKEN_EXPIRED` — missing, invalid, or expired token |
| 403 | `FORBIDDEN` — authenticated but not permitted (role or campaign/outlet scope) |
| 404 | `NOT_FOUND` |
| 409 | `ALREADY_CHECKED_IN`, `OVERLAPPING_LEAVE_REQUEST` |
| 422 | `NOT_CHECKED_IN` — action requires an open shift that doesn't exist |
| 500 | `SERVER_ERROR` |

---

## 2. Data Model (Prisma schema, as implemented)

### 2.1 Enums

```
CampaignStatus        upcoming | active | ended
StaffType             promoter | supervisor
StaffStatus           active | inactive
TargetType            item_wise | brand_wise
TargetCategorization  daily | monthly
TargetUnit            unit_wise | sales_wise
AttendanceStatus      on_time | late | leave | absent | pending
AppState              foreground | background
LeaveReason           sick_leave | annual_leave | personal | other
LeaveStatus           pending | approved | declined
SupervisorTaskType    range | feedback
OutletScopeType       all | subset
```

### 2.2 Catalog — Client / Brand / Item

**Client** (`clients`)
`id`, `companyName`, `clientName`, `contactNumber?`, `email?`, `address?`, `createdAt`, `updatedAt` → has many `Brand`, `Campaign`.

**Brand** (`brands`)
`id`, `name`, `clientId` (FK, cascade delete), `createdAt`, `updatedAt` → has many `Item`.

**Item** (`items`) — the sellable-product catalog, client-wide (not campaign-specific)
`id`, `brandId` (FK, cascade delete), `sku`, `name`, `unitPrice: Int` (LKR), `reorderLevel: Int` (default 0), `imageUrl?`, `description?`, `attributes: String[]` (default `[]`), `supplierName?`, `createdAt`, `updatedAt`.
Unique on `(brandId, sku)`.

### 2.3 Geography

**City** (`cities`): `id`, `name`, `province`, `district` → has many `Outlet`, `DistributorPoint`, `Staff`.

**Outlet** (`outlets`): `id`, `outletNo` (unique), `name`, `contactPerson?`, `address?`, `cityId` (FK), `phone?`, `mobile?`, `fax?`, `latitude: Float`, `longitude: Float`, `geofenceRadiusMeters: Int` (default 150), `createdAt`, `updatedAt`.

**DistributorPoint** (`distributor_points`): `id`, `name`, `contact?`, `address?`, `cityId` (FK), `clientId`, `createdAt`.

### 2.4 Staff (mobile login — promoters & supervisors)

**Staff** (`staff`)
| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `employeeId` | String, unique | |
| `fullName`, `displayName` | String | |
| `userType` | `StaffType` | `promoter` \| `supervisor` |
| `mobileUsername` | String, unique | mobile login identifier |
| `passwordHash` | String | bcrypt |
| `phone?` | String | |
| `cityId?` | UUID (FK) | |
| `status` | `StaffStatus`, default `active` | |
| `reportsToStaffId?` | UUID, self-FK | leave-approval chain |
| `linkedUserId?` | UUID, unique, FK → `User.id` | **set when this Staff (typically a supervisor) also has a web portal login** — this is what powers the supervisor auto-grant logic in §5.3 |
| `nic?`, `dateOfBirth?`, `gender?`, `permanentAddress?`, `currentAddress?`, `emergencyContactName?`, `emergencyContactPhone?`, `bankAccountName?`, `bankName?`, `bankAccountNumber?`, `bankBranch?` | — | Flattened HR profile fields (from the old admin panel's Staff form). Not consumed by any endpoint below — profile-management only, exposed for future admin-portal HR screens. |
| `createdAt`, `updatedAt` | DateTime | |

Relations: `city`, `reportsTo`/`reports` (self, named `StaffReportsTo`), `linkedUser`, `activations` (as field rep, named `ActivationStaff`), `supervising` (as named supervisor, named `ActivationSupervisor`), `refreshTokens`, `leaveRequests`.

**StaffRefreshToken** (`staff_refresh_tokens`): `id`, `staffId` (FK, cascade), `tokenHash` (SHA-256 of the raw refresh token — the raw value is never stored), `expiresAt`, `createdAt`, `revokedAt?`.

### 2.5 Campaign / Activation — the tenancy boundary

**Campaign** (`campaigns`)
`id`, `campaignNo` (unique), `name`, `clientId` (FK), `description?`, `startDate`, `endDate`, `status: CampaignStatus` (default `upcoming`), `timezone` (default `"Asia/Colombo"`), `createdAt`, `updatedAt` → has many `CampaignItem`, `Activation`, `CampaignAccessGrant`, `SupervisorTask`.

**CampaignItem** (`campaign_items`) — join: which Items are sellable *anywhere* in this campaign
`id`, `campaignId` (FK, cascade), `itemId` (FK), `addedAt` (default now). Unique on `(campaignId, itemId)`.

**Activation** (`activations`) — one Staff member assigned to one Outlet for one Campaign for a date range
| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `name` | String | |
| `campaignId` | FK, cascade | |
| `outletId` | FK | |
| `staffId` | FK → Staff | the field promoter |
| `supervisorStaffId?` | FK → Staff, nullable | named field supervisor — **also drives the portal auto-grant, see §5.3** |
| `distributorPointId?` | FK, nullable | |
| `dateFrom`, `dateTo` | DateTime | |
| `targetType` | `TargetType`, default `item_wise` | |
| `targetCategorization` | `TargetCategorization`, default `daily` | |
| `targetUnit` | `TargetUnit`, default `unit_wise` | |
| `shiftStart?`, `shiftEnd?` | DateTime | planned shift window, used for late/on-time computation |
| `createdAt`, `updatedAt` | DateTime | |

Relations: `campaign`, `outlet`, `staff`, `supervisor`, `distributorPoint`, and has many `ActivationItem`, `ActivationTarget`, `AttendanceRecord`, `DailyStats`, `SalesSummary`, `TrackingPing`.

**ActivationItem** (`activation_items`) — join: subset of the campaign's items actually sold at *this* activation
`id`, `activationId` (FK, cascade), `campaignItemId` (FK), `addedAt`. Unique on `(activationId, campaignItemId)`.

**ActivationTarget** (`activation_targets`)
`id`, `activationId` (FK, cascade), `dateFrom`, `dateTo`, `repeat: Boolean` (default false), `targetItemId`, `targetValue: Int`, `createdAt`.

### 2.6 Daily operational data

**AttendanceRecord** (`attendance_records`) — one row per `(activationId, date)`
`id`, `activationId` (FK, cascade), `date` (DATE), `checkInAt?`, `checkInLat?`, `checkInLng?`, `checkInLocationVerified: Boolean` (default false), `checkOutAt?`, `checkOutLat?`, `checkOutLng?`, `salesSummaryConfirmedAtCheckout: Boolean` (default false), `status: AttendanceStatus` (default `pending`), `leaveRequestId?` (FK), `createdAt`, `updatedAt`. Unique on `(activationId, date)`.

**SalesRecord** (`sales_records`) — one row per `(activationItemId, date)` — the field-rep's stock/sales counters, replaces the old spec's `StockEntry`
`id`, `activationItemId` (FK, cascade), `date` (DATE), `openingStock: Int` (default 0), `soldToday: Int` (default 0, must be ≤ `openingStock`, enforced in the route handler), `otherInterestedCustomers: Int` (default 0), `reorderFlag: Boolean` (default false), `updatedAt`. Unique on `(activationItemId, date)`. **`remainingStock` is NOT a stored column** — it is always computed as `openingStock - soldToday` at the API layer.

**DailyStats** (`daily_stats`) — one row per `(activationId, date)`
`id`, `activationId` (FK, cascade), `date` (DATE), `footFall: Int` (default 0), `approached: Int` (default 0), `converted: Int` (default 0), `updatedAt`. Unique on `(activationId, date)`. **`totalSales` is NOT stored here** — it's computed on read by summing `SalesRecord.soldToday × Item.unitPrice` across the activation's `ActivationItem`s for that date (see `computeTotalSales()` in `src/modules/mobile/stats.routes.ts`).

**SalesSummary** (`sales_summaries`) — one row per `(activationId, date)`, the rep's end-of-day confirmation
`id`, `activationId` (FK, cascade), `date` (DATE), `remarks?`, `confirmed: Boolean` (default false), `confirmedAt?`, `updatedAt`. Unique on `(activationId, date)`. Rollup fields (`itemsReceived`, `itemsSold`, `itemsRemaining`, `totalSales`, `footFall`, `approached`, `converted`) are **not stored** — computed at read time from `SalesRecord` + `DailyStats` in `buildSummary()`.

**TrackingPing** (`tracking_pings`) — high-frequency, foreground-only location log
`id`, `activationId` (FK, cascade), `latitude: Float`, `longitude: Float`, `accuracyMeters?: Float`, `capturedAt` (device clock), `receivedAt` (server clock, default now), `appState: AppState` (default `foreground`), `batteryPercent?: Int`. Indexed on `(activationId, capturedAt)`.

**LeaveRequest** (`leave_requests`)
`id`, `staffId` (FK, cascade), `fromDate`, `toDate` (both DATE), `reason: LeaveReason`, `note?`, `status: LeaveStatus` (default `pending`), `approverId?` (defaults to `Staff.reportsToStaffId` at creation time, set in the route handler — not a DB default), `createdAt`, `decidedAt?`.

**SupervisorTask** (`supervisor_tasks`) — schema-only, **no endpoints implemented yet** (deferred per earlier scoping decision)
`id`, `campaignId` (FK, cascade), `category`, `taskType: SupervisorTaskType`, `task`, `createdAt`.

### 2.7 Web portal RBAC

**Role** (`roles`)
`id` (short code, e.g. `"adm"`), `label`, `description?`, `modules: String[]`, `functionality: String[]`, `defaultUrl`, `isActive` (default true).

Seeded roles (`prisma/seed.ts`):
| `id` | Label | Write access | Default landing |
|---|---|---|---|
| `adm` | Super Admin | Full, bypasses `CampaignAccessGrant` entirely | `/dashboard` |
| `usr` | Campaign Admin | Full, but still grant-scoped like Supervisor/Sponsor | `/dashboard` |
| `supervisor` | Supervisor | Read-only | `/portal/campaigns` |
| `sponsor` | Sponsor | Read-only | `/portal/campaigns` |

**User** (`users`) — the single login table for Admin, Supervisor, and Sponsor personas
`id`, `username` (unique), `passwordHash`, `displayName`, `email?`, `roleId` (FK → Role), `isActive` (default true), `createdAt`, `updatedAt`. Has many `CampaignAccessGrant`, optional one-to-one back-reference `staffProfile` (the inverse side of `Staff.linkedUserId`).

**CampaignAccessGrant** (`campaign_access_grants`) — **the RBAC core**
`id`, `userId` (FK, cascade), `campaignId` (FK, cascade), `scopeType: OutletScopeType` (default `all`), `outletIds: String[]` (default `[]`, only meaningful when `scopeType = "subset"`), `createdAt`. Unique on `(userId, campaignId)` — **one grant row per user per campaign**, which is exactly what allows multiple Sponsor (or Supervisor) `User`s to each hold their own independent grant on the same campaign.

---

## 3. Auth Model

Two entirely independent JWT spaces — different secrets, different payload shapes, different login endpoints. A Staff token is never valid against `/admin/v1/*` and vice versa.

### 3.1 Staff (mobile)

`POST /v1/auth/login` → `{ username, password }` → verifies against `Staff.mobileUsername` + `passwordHash` (bcrypt), rejects if `status !== "active"`. Issues:
- `accessToken` — JWT, payload `{ sub: staffId, type: "staff", userType }`, expires per `STAFF_JWT_EXPIRES_IN` (seconds).
- `refreshToken` — random UUID, **hashed with SHA-256 before storage** in `StaffRefreshToken`, TTL `STAFF_REFRESH_TOKEN_TTL_DAYS`.

`POST /v1/auth/refresh` → `{ refreshToken }` → hashes, looks up an unrevoked/unexpired `StaffRefreshToken`, issues a new access token only (refresh token is not rotated).

`POST /v1/auth/forgot-password` → always returns the same generic message (stub — no email/SMS wired up yet).

`POST /v1/auth/logout` (requires Staff auth) → revokes all of that staff's unrevoked refresh tokens.

Middleware: `staffAuth` (`src/middleware/staffAuth.ts`) verifies the bearer token against `STAFF_JWT_SECRET` and attaches `req.staff = { sub, type, userType }`.

### 3.2 User (web portal — Admin/Supervisor/Sponsor)

`POST /admin/v1/auth/login` → `{ username, password }` → verifies against `User.username` + `passwordHash`, rejects if `!isActive`. Issues a single `accessToken`, payload `{ sub: userId, type: "user", roleId }`, expiry `USER_JWT_EXPIRES_IN` (duration string, e.g. `"8h"`). No refresh-token flow implemented for User yet (re-login on expiry).

Middleware: `userAuth` (`src/middleware/userAuth.ts`) verifies against `USER_JWT_SECRET`, attaches `req.user = { sub, type, roleId }`. `requireRole(...roleIds)` is a second middleware that 403s unless `req.user.roleId` is in the allow-list — every write route in the admin API lists only `"adm"` and/or `"usr"`, so Supervisor/Sponsor tokens can reach read routes but never write routes, enforced server-side regardless of client behavior.

### 3.3 Campaign/outlet access — `requireCampaignAccess` (the RBAC core)

Implemented in `src/middleware/campaignAccess.ts`. Applied to every `/admin/v1/campaigns/:campaignId/...` route via a shared `scoped` sub-router (see §4.2).

Logic:
1. If `req.user.roleId === "adm"` → bypass entirely, attach `{ campaignId, scopeType: "all", outletIds: [] }`. Super Admin always sees everything.
2. Otherwise, look up `CampaignAccessGrant` for `(req.user.sub, campaignId)`. Missing grant → `403 FORBIDDEN`.
3. Attach the resolved grant to `req.campaignGrant`.

Two helpers consume the attached grant in route handlers:
- `outletIdsAllowed(req)` → `undefined` if `scopeType === "all"` (no filtering needed), else the `outletIds` array.
- `assertOutletAllowed(req, outletId)` → throws `403 FORBIDDEN` if a specific outlet falls outside the grant's `outletIds` (no-op when scope is `"all"`).

Every campaign-scoped list/read endpoint filters by `outletIdsAllowed()`; every write endpoint that touches a specific outlet (creating/editing an Activation) calls `assertOutletAllowed()` before proceeding.

**This is the single mechanism serving all three portal personas** — there is no separate Supervisor or Sponsor API. `GET /admin/v1/campaigns` (unscoped, top-level) returns exactly the campaigns the caller has a grant for (or all campaigns, for `adm`) — this list *is* the web portal's campaign switcher.

---

## 4. Endpoint Reference

Conventions: campaign-scoped routes are nested under `/admin/v1/campaigns/:campaignId/...` and always pass through `requireCampaignAccess` first. Routes marked **[adm/usr]** additionally require `requireRole("adm", "usr")` — Supervisor and Sponsor tokens get `403` on these regardless of payload.

### 4.1 Mobile — `/v1/*`

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/login` | |
| POST | `/auth/refresh` | |
| POST | `/auth/forgot-password` | generic response, stub |
| POST | `/auth/logout` | revokes all refresh tokens |
| GET | `/me` | |
| GET | `/me/assignments/today` | resolves today's `Activation` for the logged-in Staff by date-range match; 404 if none |
| GET | `/attendance/today` | |
| POST | `/attendance/check-in` | geofence check via haversine distance vs. `Outlet.geofenceRadiusMeters`; late/on-time vs. `shiftStart` + 10 min grace; **global one-open-shift lock (§5.1)** |
| POST | `/attendance/check-out` | requires an open check-in; records `salesSummaryConfirmedAtCheckout` |
| GET | `/attendance/history?range=week\|month` | |
| POST | `/location/ping` | rejects with `422 NOT_CHECKED_IN` if no open `AttendanceRecord` exists for the staff |
| GET | `/stats/today` | `totalSales` computed live, not stored |
| PATCH | `/stats/today` | partial update, absolute values not deltas |
| GET | `/campaigns/:campaignId/outlets/:outletId/products?reorderOnly=` | resolves the staff's own `Activation` for that campaign+outlet |
| GET | `/products/:productId` | `soldAcrossAllOutletsToday` and `addedToCampaignAt` computed across all `CampaignItem`/`ActivationItem` rows for that Item |
| PATCH | `/products/:campaignProductAssignmentId/stock` | `:campaignProductAssignmentId` = `ActivationItem.id`; enforces `soldToday ≤ openingStock` |
| GET | `/sales-summary/today` | |
| PATCH | `/sales-summary/today` | remarks only |
| POST | `/sales-summary/today/confirm` | idempotent |
| GET | `/time-off/balance` | |
| GET | `/time-off/requests` | |
| POST | `/time-off/requests` | checks for overlapping pending/approved requests → `409` |
| GET | `/campaigns/:campaignId/performance?outletId=` | aggregates across the staff's own Activation for the campaign |

### 4.2 Admin/Supervisor/Sponsor — `/admin/v1/*`

**Auth**
| Method | Path | Access |
|---|---|---|
| POST | `/auth/login` | public |

**Catalog** (`catalog.routes.ts`)
| Method | Path | Access |
|---|---|---|
| GET | `/clients` | any authenticated User |
| POST | `/clients` | **[adm/usr]** |
| PATCH | `/clients/:id` | **[adm/usr]** |
| DELETE | `/clients/:id` | **[adm]** |
| GET | `/brands?clientId=` | any |
| POST | `/brands` | **[adm/usr]** |
| GET | `/items?search=` | any |
| POST | `/items` | **[adm/usr]** |
| PATCH | `/items/:id` | **[adm/usr]** |
| GET | `/cities` | any |
| POST | `/cities` | **[adm]** |
| GET | `/outlets?search=` | any |
| POST | `/outlets` | **[adm/usr]** |
| PATCH | `/outlets/:id` | **[adm/usr]** |
| GET | `/distributor-points` | any |
| POST | `/distributor-points` | **[adm/usr]** |

**Staff pool** (`staff.routes.ts`, global — not campaign-scoped, used when assigning to an Activation)
| Method | Path | Access |
|---|---|---|
| GET | `/staff?search=&userType=` | any |
| POST | `/staff` | **[adm/usr]** — create a new hire inline |
| PATCH | `/staff/:id` | **[adm/usr]** — includes optional password reset |

**Campaigns** (`campaigns.routes.ts`)
| Method | Path | Access |
|---|---|---|
| GET | `/campaigns` | any — filtered to caller's grants (or all, for `adm`); **this is the campaign switcher** |
| POST | `/campaigns` | **[adm/usr]** — creator automatically gets an `"all"`-scope `CampaignAccessGrant` |
| GET | `/campaigns/:campaignId` | grant required |
| PATCH | `/campaigns/:campaignId` | **[adm/usr]** |
| GET | `/campaigns/:campaignId/items` | grant required — this campaign's `CampaignItem` catalog |
| POST | `/campaigns/:campaignId/items` | **[adm/usr]** — body `{ itemId }` to link existing, or `{ newItem: {...} }` to create-and-link in one call |
| DELETE | `/campaigns/:campaignId/items/:campaignItemId` | **[adm/usr]** |
| GET | `/campaigns/:campaignId/access` | **[adm/usr]** — lists every User (Admin/Supervisor/Sponsor) with a grant on this campaign, with their `scopeType`/`outletIds` |

**Activations** (`activations.routes.ts`, nested under the campaign-scoped router)
| Method | Path | Access |
|---|---|---|
| GET | `/campaigns/:campaignId/activations` | grant required; auto-filtered by `outletIdsAllowed()` |
| POST | `/campaigns/:campaignId/activations` | **[adm/usr]** — `assertOutletAllowed()` on `outletId`; **auto-grants the named supervisor (§5.3)** |
| GET | `/campaigns/:campaignId/activations/:activationId` | grant + outlet check |
| PATCH | `/campaigns/:campaignId/activations/:activationId` | **[adm/usr]** — re-checks outlet if `outletId` changes; **re-runs the supervisor auto-grant** |
| DELETE | `/campaigns/:campaignId/activations/:activationId` | **[adm/usr]** |
| POST | `/.../activations/:activationId/items` | **[adm/usr]** — body `{ campaignItemId }` or `{ addAll: true }` |
| DELETE | `/.../activations/:activationId/items/:activationItemId` | **[adm/usr]** |
| GET | `/.../activations/:activationId/targets` | grant + outlet check |
| POST | `/.../activations/:activationId/targets` | **[adm/usr]** |

**Operations** (`operations.routes.ts`, nested under the campaign-scoped router)
| Method | Path | Access |
|---|---|---|
| GET | `/campaigns/:campaignId/attendance?outletId=&dateFrom=&dateTo=` | grant required, outlet-filtered |
| GET | `/campaigns/:campaignId/sales?outletId=&dateFrom=&dateTo=` | grant required, outlet-filtered |
| PATCH | `/campaigns/:campaignId/sales/:salesRecordId` | **[adm/usr]** — correction, re-validates outlet ownership |
| GET | `/campaigns/:campaignId/stats?outletId=&dateFrom=&dateTo=` | returns `{ totals, byDay }` |
| GET | `/campaigns/:campaignId/tracking/live` | current position of every checked-in staff member (open `AttendanceRecord` + latest `TrackingPing`), outlet-filtered — **powers the Supervisor/Sponsor live map** |
| GET | `/campaigns/:campaignId/leave-requests` | grant required, filtered to staff on this campaign's activations |
| PATCH | `/campaigns/:campaignId/leave-requests/:id` | **[adm/usr]** — approve/decline |

**Reports** (`reports.routes.ts`, nested under the campaign-scoped router)
| Method | Path | Notes |
|---|---|---|
| GET | `/campaigns/:campaignId/reports/sku-wise` | rows + grand total, outlet-filtered |
| GET | `/campaigns/:campaignId/reports/brand-wise` | rows + grand total, outlet-filtered |
| GET | `/campaigns/:campaignId/reports/reorder` | today's `SalesRecord`s with `reorderFlag = true` |
| GET | `/campaigns/:campaignId/reports/attendance-monthly?month=MM-YYYY` | per-activation day-grid |

**RBAC administration** (`rbac.routes.ts`, **[adm] only for the entire file**)
| Method | Path |
|---|---|
| GET | `/users` |
| POST | `/users` |
| PATCH | `/users/:id` |
| GET | `/users/:id/campaign-access` |
| POST | `/users/:id/campaign-access` — body `{ campaignId, scopeType: "all"\|"subset", outletIds? }`; `outletIds` required when `scopeType = "subset"` |
| DELETE | `/users/:id/campaign-access/:campaignId` |
| GET | `/roles` |
| POST | `/roles` |

---

## 5. Business Logic Notes (decisions made and implemented)

### 5.1 Global one-open-shift lock

A Staff member can only ever have **one open shift at a time, across every campaign they're assigned to** — not just within a single Activation. `POST /v1/attendance/check-in` queries for *any* `AttendanceRecord` across *any* of the staff's Activations where `checkInAt` is set and `checkOutAt` is null; if one exists, the request is rejected with `409 ALREADY_CHECKED_IN` (message differs depending on whether the open shift is on the same Activation or a different one). This blocks moonlighting across concurrent campaigns by policy. Implemented in `src/modules/mobile/attendance.routes.ts`.

### 5.2 `totalSales` / rollups are always computed, never stored

`DailyStats.totalSales`, `SalesSummary.{itemsReceived,itemsSold,itemsRemaining,totalSales,footFall,approached,converted}`, and `SalesRecord.remainingStock` are **derived at read time**, not columns. This guarantees they can never drift from the underlying `SalesRecord`/`DailyStats` rows — there is no dual-write to keep in sync. Any new reporting endpoint should follow the same pattern rather than introducing a stored/cached total.

### 5.3 Supervisor auto-grant on Activation assignment

Setting `Activation.supervisorStaffId` (on `POST` create or `PATCH` update, in `src/modules/admin/activations.routes.ts`) automatically provisions or expands that supervisor's web-portal access:
1. Look up the named supervisor's `Staff.linkedUserId`. If null (no portal login yet), **no-op** — nothing to grant.
2. If a `CampaignAccessGrant` already exists for `(linkedUserId, campaignId)`:
   - If `scopeType === "all"` → leave untouched (already sees everything).
   - If `scopeType === "subset"` → append the Activation's `outletId` to `outletIds` if not already present.
3. If no grant exists yet → create one with `scopeType: "subset"`, `outletIds: [outletId]`.

**This only ever expands access, never revokes it.** Reassigning a supervisor away from an outlet does not remove their prior grant — that remains a deliberate, separate admin action via `DELETE /admin/v1/users/:id/campaign-access/:campaignId` or by issuing a fresh `POST .../campaign-access` with a narrower `outletIds` list.

### 5.4 Multiple Sponsors (or Supervisors) per campaign

`CampaignAccessGrant` is unique on `(userId, campaignId)`, not `(campaignId)` alone — so any number of `User`s can each hold an independent grant on the same campaign. There is no artificial one-sponsor-per-campaign constraint anywhere in the schema or route logic. `GET /admin/v1/campaigns/:campaignId/access` lists everyone (Admins, Supervisors, Sponsors) currently granted access to a given campaign, for the admin's convenience when auditing who can see what.

### 5.5 Supervisor outlet scoping — "some or all outlets, depending on campaign size"

This is the reason `CampaignAccessGrant` exists as a distinct entity from `Activation.supervisorStaffId`, rather than deriving portal access purely from who's named on an Activation:
- A small campaign's admin will typically grant a supervisor `scopeType: "all"` once, covering every outlet without per-outlet bookkeeping.
- A large campaign's admin can instead grant `scopeType: "subset"` with a hand-picked `outletIds` list, independent of (though initially seeded by, per §5.3) which outlets that supervisor happens to be the named field supervisor for.
- Every outlet-scoped read (`attendance`, `sales`, `stats`, `tracking/live`, `activations`) and outlet-touching write (creating/editing an `Activation`) filters through `outletIdsAllowed()`/`assertOutletAllowed()` uniformly, so this scoping is enforced identically for Supervisor and Sponsor roles — there's no separate code path per role.

### 5.6 Geofence & late-arrival grace period

Check-in verifies location via haversine distance between the submitted lat/lng and `Outlet.{latitude,longitude}`, compared against `Outlet.geofenceRadiusMeters` (default 150). Late-vs-on-time status compares the check-in timestamp against `Activation.shiftStart` plus a **10-minute grace period** (`GRACE_PERIOD_MINUTES` constant in `attendance.routes.ts`) — both values are currently hardcoded defaults, not yet configurable per outlet/campaign (flagged as an open item in the original mobile API spec, §10.1, still unresolved).

### 5.7 Location ping enforcement

`POST /v1/location/ping` is rejected server-side (`422 NOT_CHECKED_IN`) if the staff member has no open `AttendanceRecord`, regardless of client behavior — the client's own foreground/background discipline (documented in the mobile API spec §5) is not trusted as the sole enforcement mechanism.

---

## 6. Auth secrets & environment

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `PORT` | default 4000 |
| `STAFF_JWT_SECRET`, `STAFF_JWT_EXPIRES_IN` (seconds) | mobile access tokens |
| `STAFF_REFRESH_TOKEN_TTL_DAYS` | mobile refresh token lifetime |
| `USER_JWT_SECRET`, `USER_JWT_EXPIRES_IN` (duration string, e.g. `"8h"`) | web portal access tokens |
| `BCRYPT_SALT_ROUNDS` | default 10 |

Staff and User JWTs use **separate secrets** by design — a compromised mobile secret can't be used to forge web-portal tokens or vice versa.

## 7. Seed data (`prisma/seed.ts`)

Running `npm run prisma:seed` provisions:
- All four `Role`s (`adm`, `usr`, `supervisor`, `sponsor`).
- A Super Admin `User`: `admin` / `ChangeMe123!`.
- A sample `Client` (Prisha Naturals), `Brand`, `Item` (Tea Tree Shampoo 320ml), `City` (Nawala), `Outlet` (Nawala Retail Outlet), `Campaign` ("Sktest Activation", `CMP-0001`), with an `"all"`-scope `CampaignAccessGrant` for the admin user.
- A sample `Staff` mobile login: `sktest` / `Field123!`, with an `Activation` on the seeded campaign/outlet and a linked `ActivationItem`/`CampaignItem`.

This is enough to exercise every mobile endpoint (login → assignment → check-in → stock update → stats → sales summary → check-out) and every admin read endpoint (campaigns, activations, items) against real data immediately after seeding.

## 8. Deferred / not yet implemented

- `SupervisorTask` — table exists, no CRUD endpoints (QA checklist workflow deferred).
- Password reset for Staff is a stub (generic response, no email/SMS delivery).
- No refresh-token flow for `User` (web portal) — re-login required on expiry.
- Geofence radius and late-arrival grace period are hardcoded defaults, not yet configurable per outlet/campaign.
- No automated test suite yet.
- `SalesSummary`/`DailyStats` rollups are recomputed on every read (§5.2) — fine at current scale; worth revisiting (caching/materialized views) if a campaign's per-day item count grows very large.
