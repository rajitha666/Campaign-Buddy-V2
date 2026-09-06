# Campaign Buddy — Backend Specification (v3, unified & conflict-resolved)

**Status:** This is now the **single, authoritative** backend spec for Campaign Buddy — mobile, admin portal, supervisor portal, and sponsor portal alike.

**Supersedes, entirely:**
- `CampaignBuddy_Backend_Spec_v2.md` (v2) — folded in wholesale; nothing lost.
- `CampaignBuddy_Full_Backend_Contract.md` (v2.1) — **retired**. That document assumed a PHP (Slim 3) / MySQL stack that was never implemented and is not the direction going forward (see Changelog v3 for the full reasoning). Its data model and endpoint content conflicted with the implemented system on several business rules; every conflict is resolved below, in Backend Spec v2's favor except where explicitly noted. Its still-useful, non-conflicting additions (§7.7's three genuinely-new endpoints, the roleId→persona mapping) are folded in here. Keep the original only as historical decision-log context — do not build against it.
- `CampaignBuddy__Mobile_API_Spec.md` (v1.0, draft) — superseded. Its older naming (`User`→`Staff`, `Assignment`→`Activation`, `Product`→`Item`, `StockEntry`→`SalesRecord`, `CampaignProductAssignment`→`ActivationItem`) does not reappear anywhere below.

**Stack (confirmed v3):** Node.js, TypeScript, Express, PostgreSQL, Prisma ORM. JWT auth (two independent token spaces — see §3). bcrypt password hashing.

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
| Pagination (portal only) | Every `/admin/v1/*` list endpoint accepts `?page=1&pageSize=25&search=<text>`; `meta.total` is the unfiltered-by-page count. `search` matches whatever field that list's UI table searches (e.g. Client Name for `/clients`, Outlet Name for `/outlets`). |

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
| 403 | `FORBIDDEN` (or, on `/admin/v1/*`, `CAMPAIGN_ACCESS_DENIED` / `OUTLET_ACCESS_DENIED` / `READ_ONLY_ROLE` — authenticated but not permitted (role, grant, or outlet scope) |
| 404 | `NOT_FOUND` |
| 409 | `ALREADY_CHECKED_IN`, `OVERLAPPING_LEAVE_REQUEST` |
| 422 | `NOT_CHECKED_IN` — action requires an open shift that doesn't exist |
| 500 | `SERVER_ERROR` |

---

## 2. Data Model (Prisma schema, as implemented — see `CampaignBuddy_schema_v3.prisma`)

### 2.1 Enums

```
CampaignStatus        upcoming | active | ended
StaffType              promoter | supervisor
StaffStatus            active | inactive
TargetType             item_wise | brand_wise
TargetCategorization   daily | monthly
TargetUnit             unit_wise | sales_wise
AttendanceStatus       on_time | late | leave | absent | pending
AppState               foreground | background
LeaveReason            sick_leave | annual_leave | personal | other
LeaveStatus            pending | approved | declined
SupervisorTaskType     range | feedback
OutletScopeType        all | subset
```

### 2.2 Catalog — Client / Brand / Item

**Client** (`clients`) `id`, `companyName`, `clientName`, `contactNumber?`, `email?`, `address?`, `createdAt`, `updatedAt` → has many `Brand`, `Campaign`.

**Brand** (`brands`) `id`, `name`, `clientId` (FK, cascade delete), `createdAt`, `updatedAt` → has many `Item`.

**Item** (`items`) — the sellable-product catalog, client-wide (not campaign-specific)
`id`, `brandId` (FK, cascade delete), `sku`, `name`, `unitPrice: Int` (LKR), `reorderLevel: Int` (default 0), `imageUrl?`, `description?`, `attributes: String[]` (default `[]`), `supplierName?`, `createdAt`, `updatedAt`. Unique on `(brandId, sku)`.

### 2.3 Geography

**City** (`cities`): `id`, `name`, `province`, `district` → has many `Outlet`, `DistributorPoint`, `Staff`.

**Outlet** (`outlets`): `id`, `outletNo` (unique), `name`, `contactPerson?`, `address?`, `cityId` (FK), `phone?`, `mobile?`, `fax?`, `latitude: Float`, `longitude: Float`, `geofenceRadiusMeters: Int` (default 150), `createdAt`, `updatedAt`.

**DistributorPoint** (`distributor_points`): `id`, `name`, `contact?`, `address?`, `cityId` (FK), `clientId`, `createdAt`.

### 2.4 Staff (mobile login — promoters & supervisors)

**Confirmed v3: this is the final HR field set.** The larger ~30-field form seen in the original StaffPulse admin audit (marital status, English proficiency ratings, work-type/designation pick-lists, profile photo upload) is **explicitly out of scope**, not a pending gap — see Changelog v3.

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
| `linkedUserId?` | UUID, unique, FK → `User.id` | **set when this Staff (typically a supervisor) also has a web portal login** — powers the supervisor auto-grant logic in §5.3 |
| `nic?`, `dateOfBirth?`, `gender?`, `permanentAddress?`, `currentAddress?`, `emergencyContactName?`, `emergencyContactPhone?`, `bankAccountName?`, `bankName?`, `bankAccountNumber?`, `bankBranch?` | — | Flattened HR profile fields. Not consumed by any endpoint below — profile-management only. **This list is final for v3, no photo field.** |
| `createdAt`, `updatedAt` | DateTime | |

Relations: `city`, `reportsTo`/`reports` (self, named `StaffReportsTo`), `linkedUser`, `activations` (as field rep, named `ActivationStaff`), `supervising` (as named supervisor, named `ActivationSupervisor`), `refreshTokens`, `leaveRequests`, `supervisorRoutes` (new in v3).

**StaffRefreshToken** (`staff_refresh_tokens`): `id`, `staffId` (FK, cascade), `tokenHash` (SHA-256 of the raw refresh token — the raw value is never stored), `expiresAt`, `createdAt`, `revokedAt?`.

### 2.5 Campaign / Activation — the tenancy boundary

**Campaign** (`campaigns`)
`id`, `campaignNo` (unique), `name`, `clientId` (FK), `description?`, `startDate`, `endDate`, `status: CampaignStatus` (default `upcoming`), `timezone` (default `"Asia/Colombo"`), `createdAt`, `updatedAt` → has many `CampaignItem`, `Activation`, `CampaignAccessGrant`, `SupervisorTask`, `SupervisorRoute` (new in v3).

**Confirmed v3 — `status` is a real, stored column, not purely computed at read time.** It's kept in sync automatically (recomputed from `startDate`/`endDate` vs. today, in the campaign's `timezone`, whenever the row is read or written) but an `adm`/`usr` can also override it manually (e.g. ending a campaign early). See §5.8.

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

**Confirmed v3 — concurrent Activations across campaigns are allowed at the data-model level** (a Staff row can belong to any number of Activations), but see §5.1: **check-in** is still globally locked to one open shift at a time. Being assigned to concurrent Activations is fine; having two simultaneously *checked-in* shifts is not.

**ActivationItem** (`activation_items`) — join: subset of the campaign's items actually sold at *this* activation
`id`, `activationId` (FK, cascade), `campaignItemId` (FK), `addedAt`. Unique on `(activationId, campaignItemId)`.

**ActivationTarget** (`activation_targets`)
`id`, `activationId` (FK, cascade), `dateFrom`, `dateTo`, `repeat: Boolean` (default false), `targetItemId`, `targetValue: Int`, `createdAt`.

### 2.6 Daily operational data

**AttendanceRecord** (`attendance_records`) — one row per `(activationId, date)`
`id`, `activationId` (FK, cascade), `date` (DATE), `checkInAt?`, `checkInLat?`, `checkInLng?`, `checkInLocationVerified: Boolean` (default false), `checkOutAt?`, `checkOutLat?`, `checkOutLng?`, `salesSummaryConfirmedAtCheckout: Boolean` (default false), `status: AttendanceStatus` (default `pending`), `leaveRequestId?` (FK), `createdAt`, `updatedAt`. Unique on `(activationId, date)`.

**Confirmed v3 — geofencing is a soft flag, never a block.** `checkInLocationVerified` is set to `false` when the check-in coordinates fall outside `Outlet.geofenceRadiusMeters`, but check-in always succeeds regardless. See §5.6.

**SalesRecord** (`sales_records`) — one row per `(activationItemId, date)` — the field-rep's stock/sales counters
`id`, `activationItemId` (FK, cascade), `date` (DATE), `openingStock: Int` (default 0), `soldToday: Int` (default 0, must be ≤ `openingStock`, enforced in the route handler), `otherInterestedCustomers: Int` (default 0), `reorderFlag: Boolean` (default false), `updatedAt`. Unique on `(activationItemId, date)`. **`remainingStock` is NOT a stored column** — always computed as `openingStock - soldToday` at the API layer. Mid-day restock is handled by editing `openingStock` in place (mobile stock-update endpoint or portal's `PATCH /campaigns/:id/sales/:salesRecordId` correction) — never a second row for the same `(activationItemId, date)`. `soldToday ≤ openingStock` is validated against the **current** value of `openingStock`, so raising it mid-day can legally let `soldToday` exceed the morning's original opening figure.

**DailyStats** (`daily_stats`) — one row per `(activationId, date)`
`id`, `activationId` (FK, cascade), `date` (DATE), `footFall: Int` (default 0), `approached: Int` (default 0), `converted: Int` (default 0), `updatedAt`. Unique on `(activationId, date)`. **`totalSales` is NOT stored** — computed on read as `Σ(SalesRecord.soldToday × Item.unitPrice)` across the activation's `ActivationItem`s for that date (see `computeTotalSales()` in `src/modules/mobile/stats.routes.ts`). No discounts or returns/refunds logic in v1.

**SalesSummary** (`sales_summaries`) — one row per `(activationId, date)`, the rep's end-of-day confirmation
`id`, `activationId` (FK, cascade), `date` (DATE), `remarks?`, `confirmed: Boolean` (default false), `confirmedAt?`, `updatedAt`. Unique on `(activationId, date)`. Rollup fields (`itemsReceived`, `itemsSold`, `itemsRemaining`, `totalSales`, `footFall`, `approached`, `converted`) are **not stored** — computed at read time from `SalesRecord` + `DailyStats` in `buildSummary()`.

**TrackingPing** (`tracking_pings`) — high-frequency, foreground-only location log
`id`, `activationId` (FK, cascade), `latitude: Float`, `longitude: Float`, `accuracyMeters?: Float`, `capturedAt` (device clock), `receivedAt` (server clock, default now), `appState: AppState` (default `foreground`), `batteryPercent?: Int`. Indexed on `(activationId, capturedAt)`.

**LeaveRequest** (`leave_requests`)
`id`, `staffId` (FK, cascade), `fromDate`, `toDate` (both DATE), `reason: LeaveReason`, `note?`, `status: LeaveStatus` (default `pending`), `approverId?` (defaults to `Staff.reportsToStaffId` at creation time, set in the route handler — not a DB default), `createdAt`, `decidedAt?`.

**SupervisorTask** (`supervisor_tasks`) — schema-only, **no endpoints implemented**, still deferred. `id`, `campaignId` (FK, cascade), `category`, `taskType: SupervisorTaskType`, `task`, `createdAt`. Portal-only configuration when eventually built — mobile app doesn't read it.

**SupervisorRoute** (`supervisor_routes`) — **new in v3**, backs the Admin Panel's "Assign Routes" screen (previously had no backend entity at all)
`id`, `campaignId` (FK, cascade), `supervisorStaffId` (FK → Staff, cascade), `outletIds: String[]` (default `[]` — the planned outlets, all belonging to this campaign), `dateFrom`, `dateTo` (both DATE), `createdAt`, `updatedAt`. Deliberately **campaign-scoped** (unlike a fully global design) so it's enforced by the same `requireCampaignAccess` / `CampaignAccessGrant` mechanism as every other campaign resource, rather than needing a special-cased global route. See §4.2 and §5.9.

### 2.7 Web portal RBAC

**Role** (`roles`) `id` (short code), `label`, `description?`, `modules: String[]`, `functionality: String[]`, `defaultUrl`, `isActive` (default true).

**Confirmed v3 — exactly four seeded roles**, no more:
| `id` | Label | Write access | Default landing |
|---|---|---|---|
| `adm` | Super Admin | Full, bypasses `CampaignAccessGrant` entirely | `/dashboard` |
| `usr` | Campaign Admin | Full, but still grant-scoped like Supervisor/Sponsor | `/dashboard` |
| `supervisor` | Supervisor | Read-only | `/portal/campaigns` |
| `sponsor` | Sponsor | Read-only | `/portal/campaigns` |

There is no `super` or `client` role id in this system — those only ever existed in the retired Full Backend Contract draft and the original pre-rebuild StaffPulse audit.

**`roleId` → UI persona mapping** (needed by the portal frontend's nav/role gating — carried forward from the one useful piece of the retired contract doc, corrected to the real 4 roles):
```
adm, usr   → "admin"       (full CRUD — but note: adm bypasses CampaignAccessGrant
                             entirely, usr does NOT; don't conflate them for data
                             scoping just because they share a nav persona)
supervisor → "supervisor"  (read-only, outlet-scoped)
sponsor    → "sponsor"     (read-only, campaign-scoped)
```
If a new `roleId` is ever added, it does not auto-classify — flag it to the frontend team explicitly.

**User** (`users`) — the single login table for Admin, Supervisor, and Sponsor personas
`id`, `username` (unique), `passwordHash`, `displayName`, `email?`, `roleId` (FK → Role), `isActive` (default true), `createdAt`, `updatedAt`. Has many `CampaignAccessGrant`, optional one-to-one back-reference `staffProfile`.

**CampaignAccessGrant** (`campaign_access_grants`) — **the RBAC core**
`id`, `userId` (FK, cascade), `campaignId` (FK, cascade), `scopeType: OutletScopeType` (default `all`), `outletIds: String[]` (default `[]`, only meaningful when `scopeType = "subset"`), `createdAt`. Unique on `(userId, campaignId)`.

---

## 3. Auth Model

Two entirely independent JWT spaces — different secrets, different payload shapes, different login endpoints. A Staff token is never valid against `/admin/v1/*` and vice versa.

### 3.1 Staff (mobile)

`POST /v1/auth/login` → `{ username, password }` → verifies against `Staff.mobileUsername` + `passwordHash` (bcrypt), rejects if `status !== "active"`. Issues:
- `accessToken` — JWT, payload `{ sub: staffId, type: "staff", userType }`, expires per `STAFF_JWT_EXPIRES_IN` (seconds).
- `refreshToken` — random UUID, **hashed with SHA-256 before storage** in `StaffRefreshToken`, TTL `STAFF_REFRESH_TOKEN_TTL_DAYS`.

`POST /v1/auth/refresh` → `{ refreshToken }` → hashes, looks up an unrevoked/unexpired `StaffRefreshToken`, issues a new access token only (refresh token is not rotated).

`POST /v1/auth/forgot-password` → always returns the same generic message (stub — no email/SMS delivery wired up yet).

`POST /v1/auth/logout` (requires Staff auth) → revokes all of that staff's unrevoked refresh tokens.

Middleware: `staffAuth` (`src/middleware/staffAuth.ts`) verifies the bearer token against `STAFF_JWT_SECRET` and attaches `req.staff = { sub, type, userType }`.

### 3.2 User (web portal — Admin/Supervisor/Sponsor)

`POST /admin/v1/auth/login` → `{ username, password }` → verifies against `User.username` + `passwordHash`, rejects if `!isActive`. Issues a single `accessToken`, payload `{ sub: userId, type: "user", roleId }`, expiry `USER_JWT_EXPIRES_IN` (duration string, e.g. `"8h"`).

**Confirmed v3 — no refresh-token flow for User, staying deferred.** Re-login is required on expiry. (The retired contract doc had decided to build this; that decision does not carry forward — revisit only if re-login-on-expiry proves genuinely disruptive in practice.)

Middleware: `userAuth` (`src/middleware/userAuth.ts`) verifies against `USER_JWT_SECRET`, attaches `req.user = { sub, type, roleId }`. `requireRole(...roleIds)` 403s unless `req.user.roleId` is in the allow-list — every write route in the admin API lists only `"adm"` and/or `"usr"`, so Supervisor/Sponsor tokens can reach read routes but never write routes, enforced server-side regardless of client behavior.

### 3.3 Campaign/outlet access — `requireCampaignAccess` (the RBAC core)

Implemented in `src/middleware/campaignAccess.ts`. Applied to every `/admin/v1/campaigns/:campaignId/...` route via a shared `scoped` sub-router (see §4.2).

Logic:
1. If `req.user.roleId === "adm"` → bypass entirely, attach `{ campaignId, scopeType: "all", outletIds: [] }`.
2. Otherwise, look up `CampaignAccessGrant` for `(req.user.sub, campaignId)`. Missing grant → `403 CAMPAIGN_ACCESS_DENIED`.
3. Attach the resolved grant to `req.campaignGrant`.

Two helpers consume the attached grant in route handlers:
- `outletIdsAllowed(req)` → `undefined` if `scopeType === "all"`, else the `outletIds` array.
- `assertOutletAllowed(req, outletId)` → throws `403 OUTLET_ACCESS_DENIED` if a specific outlet falls outside the grant's `outletIds` (no-op when scope is `"all"`).

Every campaign-scoped list/read endpoint filters by `outletIdsAllowed()`; every write endpoint that touches a specific outlet calls `assertOutletAllowed()` before proceeding. This is the single mechanism serving all three portal personas — there is no separate Supervisor or Sponsor API. `GET /admin/v1/campaigns` returns exactly the campaigns the caller has a grant for (or all campaigns, for `adm`) — this list *is* the web portal's campaign switcher.

---

## 4. Endpoint Reference

Conventions: campaign-scoped routes are nested under `/admin/v1/campaigns/:campaignId/...` and always pass through `requireCampaignAccess` first. Routes marked **[adm/usr]** additionally require `requireRole("adm", "usr")`.

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
| POST | `/attendance/check-in` | geofence check via haversine distance vs. `Outlet.geofenceRadiusMeters` — **soft flag only, never blocks (§5.6)**; late/on-time vs. `shiftStart` + grace period (§5.6); **global one-open-shift lock (§5.1)** |
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
| POST | `/auth/logout` | requires User auth |

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
| GET | `/staff?search=&userType=` | any — **empty `search` must return the full pool** (paginated), load-bearing for ~8 dropdowns across the portal |
| POST | `/staff` | **[adm/usr]** — create a new hire inline |
| PATCH | `/staff/:id` | **[adm/usr]** — includes optional password reset |
| GET | `/staff/:staffId/evaluation?dateFrom=&dateTo=` | any — **new in v3**, folded in from the retired contract doc's §7.7.1 (no conflict, just previously homeless). Response: `{ overallPerformancePct, attendancePct, totalSales, totalItems, avgSalesPerMonth, highestDailySales, highestPerformingDate, brandContribution: [{ brandName, percent }] }` |

**Campaigns** (`campaigns.routes.ts`)
| Method | Path | Access |
|---|---|---|
| GET | `/campaigns` | any — filtered to caller's grants (or all, for `adm`); **this is the campaign switcher** |
| POST | `/campaigns` | **[adm/usr]** — creator automatically gets an `"all"`-scope `CampaignAccessGrant` |
| GET | `/campaigns/:campaignId` | grant required |
| PATCH | `/campaigns/:campaignId` | **[adm/usr]** — includes optional manual `status` override (§5.8) |
| GET | `/campaigns/:campaignId/items` | grant required — this campaign's `CampaignItem` catalog |
| POST | `/campaigns/:campaignId/items` | **[adm/usr]** — body `{ itemId }` to link existing, or `{ newItem: {...} }` to create-and-link in one call |
| DELETE | `/campaigns/:campaignId/items/:campaignItemId` | **[adm/usr]** |
| GET | `/campaigns/:campaignId/access` | **[adm/usr]** — lists every User with a grant on this campaign, with their `scopeType`/`outletIds` |

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
| PATCH | `/campaigns/:campaignId/sales/:salesRecordId` | **[adm/usr]** — correction, re-validates outlet ownership; can raise `openingStock` mid-day (§2.6) |
| GET | `/campaigns/:campaignId/sales/lookup?staffId=&outletId=&activationId=&date=` | grant required — **new in v3**, folded in from the retired contract doc's §7.7.4. The cascading-dropdown load step before the portal's editable Update Sales grid. Response: `[{ id (=salesRecordId), itemName, unitPrice, openingStock, soldToday }]`. Nested under the campaign-scoped router (the original draft had this as a global endpoint with `campaignId` as a query param — moved here for consistency with every other grant-enforced resource) |
| GET | `/campaigns/:campaignId/stats?outletId=&dateFrom=&dateTo=` | returns `{ totals, byDay }` |
| GET | `/campaigns/:campaignId/tracking/live` | current position of every checked-in staff member (open `AttendanceRecord` + latest `TrackingPing`), outlet-filtered — **powers the Supervisor/Sponsor live map**. **Confirmed campaign-scoped** (not global — see Changelog v3 for why the retired contract doc's "global" call doesn't carry forward: a global endpoint would sidestep `CampaignAccessGrant` scoping entirely, which conflicts with the rest of this API's design) |
| GET | `/campaigns/:campaignId/leave-requests` | grant required, filtered to staff on this campaign's activations |
| PATCH | `/campaigns/:campaignId/leave-requests/:id` | **[adm/usr]** — approve/decline, body `{ "status": "approved" \| "declined" }` |
| GET | `/campaigns/:campaignId/supervisor-routes?supervisorId=&outletId=&dateFrom=&dateTo=` | grant required — **new in v3** (Assign Routes, built this pass). See §5.9 |
| POST | `/campaigns/:campaignId/supervisor-routes` | **[adm/usr]** — body `{ supervisorStaffId, outletIds: [...], dateFrom, dateTo }`; every id in `outletIds` is checked with `assertOutletAllowed()` |
| PATCH | `/campaigns/:campaignId/supervisor-routes/:id` | **[adm/usr]** |
| DELETE | `/campaigns/:campaignId/supervisor-routes/:id` | **[adm/usr]** |

**Reports** (`reports.routes.ts`, nested under the campaign-scoped router)
| Method | Path | Notes |
|---|---|---|
| GET | `/campaigns/:campaignId/reports/sku-wise` | rows + grand total, outlet-filtered. **Confirmed v3: this single endpoint also serves the Sponsor "client report" use case** via normal grant-based filtering — there is no separate `-client` route (§5.10) |
| GET | `/campaigns/:campaignId/reports/brand-wise` | rows + grand total, outlet-filtered. Same "no separate client variant" rule applies |
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

## 5. Business Logic Notes

### 5.1 Global one-open-shift lock

A Staff member can only ever have **one open shift at a time, across every campaign they're assigned to** — not just within a single Activation. `POST /v1/attendance/check-in` queries for *any* `AttendanceRecord` across *any* of the staff's Activations where `checkInAt` is set and `checkOutAt` is null; if one exists, the request is rejected with `409 ALREADY_CHECKED_IN` (message differs depending on whether the open shift is on the same Activation or a different one). This blocks moonlighting across concurrent campaigns by policy — note this governs **checking in**, not being *assigned* to concurrent Activations, which is allowed (§2.5). Implemented in `src/modules/mobile/attendance.routes.ts`.

### 5.2 `totalSales` / rollups are always computed, never stored

`DailyStats.totalSales`, `SalesSummary.{itemsReceived,itemsSold,itemsRemaining,totalSales,footFall,approached,converted}`, and `SalesRecord.remainingStock` are **derived at read time**, not columns. Any new reporting endpoint should follow the same pattern.

### 5.3 Supervisor auto-grant on Activation assignment

Setting `Activation.supervisorStaffId` (on `POST` create or `PATCH` update) automatically provisions or expands that supervisor's web-portal access:
1. Look up the named supervisor's `Staff.linkedUserId`. If null → no-op.
2. If a `CampaignAccessGrant` already exists for `(linkedUserId, campaignId)`:
   - `scopeType === "all"` → leave untouched.
   - `scopeType === "subset"` → append the Activation's `outletId` to `outletIds` if not already present.
3. If no grant exists yet → create one with `scopeType: "subset"`, `outletIds: [outletId]`. **Confirmed v3: always `"subset"` seeded with just that one outlet — never `"all"` by default.**

This only ever expands access, never revokes it.

### 5.4 Multiple Sponsors (or Supervisors) per campaign

`CampaignAccessGrant` is unique on `(userId, campaignId)`, not `(campaignId)` alone. `GET /admin/v1/campaigns/:campaignId/access` lists everyone currently granted access to a given campaign.

### 5.5 Supervisor outlet scoping

`CampaignAccessGrant` exists as a distinct entity from `Activation.supervisorStaffId` so admins can choose `"all"` for a small campaign or a hand-picked `"subset"` for a large one, independent of (though initially seeded by, per §5.3) which outlets a supervisor is named field supervisor for. Every outlet-scoped read/write filters through `outletIdsAllowed()`/`assertOutletAllowed()` uniformly.

### 5.6 Geofence & late-arrival grace period — CONFIRMED v3

- **Geofence check is a soft flag only.** Check-in verifies location via haversine distance between the submitted lat/lng and `Outlet.{latitude,longitude}`, compared against `Outlet.geofenceRadiusMeters` (default 150). If outside the radius, `checkInLocationVerified` is set to `false` — **check-in is never rejected for this reason.** Attendance tables (mobile + portal) surface unverified check-ins for review; they don't prevent them.
- **Grace period stays at 10 minutes**, hardcoded (`GRACE_PERIOD_MINUTES` constant in `attendance.routes.ts`), compared against `Activation.shiftStart`. **Still not configurable per outlet/campaign** — flagged as a future improvement, not built in this pass.

### 5.7 Location ping enforcement

`POST /v1/location/ping` is rejected server-side (`422 NOT_CHECKED_IN`) if the staff member has no open `AttendanceRecord`, regardless of client behavior.

### 5.8 `Campaign.status` sync rule — CONFIRMED v3

`status` is a stored column (not purely computed at read time). It is **auto-recomputed** from `startDate`/`endDate` vs. "today" in the campaign's `timezone` whenever the campaign row is read or written (`today < startDate → upcoming`; `startDate ≤ today ≤ endDate → active`; `today > endDate → ended`), and the recomputed value is persisted if it's stale. An `adm`/`usr` can also set `status` manually via `PATCH /campaigns/:campaignId` (e.g. ending a campaign early) — a manual value is **not** silently overwritten by the next auto-sync unless the underlying dates actually change, at which point the normal date-derived rule takes over again.

### 5.9 SupervisorRoute (Assign Routes) — NEW in v3

Built this pass; previously had no backend entity in any prior doc. One `SupervisorRoute` row represents a planned set of outlet visits for a named supervisor over a date range, within one campaign. `outletIds` is validated on write — every id must belong to an Outlet that has an Activation on this campaign, and (for `usr` callers) must pass `assertOutletAllowed()` individually. This is planning data only — it does not itself drive attendance, check-in, or tracking; it's a portal-side schedule the Supervisor/Assign-Routes screen reads and writes.

### 5.10 Client-scoped ("Sponsor") reports — CONFIRMED v3, no separate endpoints

There is exactly one set of report endpoints (`/reports/sku-wise`, `/reports/brand-wise`, `/reports/reorder`, `/reports/attendance-monthly`). A Sponsor calling these gets the identical response shape as an Admin, automatically filtered to their `CampaignAccessGrant`'s campaign/outlet scope — the same `requireCampaignAccess` + `outletIdsAllowed()` mechanism as every other campaign-scoped read. There is no `-client` or `_c` route variant anywhere in this API.

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

Staff and User JWTs use **separate secrets** by design.

## 7. Seed data (`prisma/seed.ts`)

Running `npm run prisma:seed` provisions:
- All four `Role`s (`adm`, `usr`, `supervisor`, `sponsor`).
- A Super Admin `User`: `admin` / `ChangeMe123!`.
- A sample `Client` (Prisha Naturals), `Brand`, `Item` (Tea Tree Shampoo 320ml), `City` (Nawala), `Outlet` (Nawala Retail Outlet), `Campaign` ("Sktest Activation", `CMP-0001`), with an `"all"`-scope `CampaignAccessGrant` for the admin user.
- A sample `Staff` mobile login: `sktest` / `Field123!`, with an `Activation` on the seeded campaign/outlet and a linked `ActivationItem`/`CampaignItem`.
- **No `SupervisorRoute` seed row** — new entity, left empty by default.

This is enough to exercise every mobile endpoint and every admin read endpoint against real data immediately after seeding.

## 8. Deferred / not yet implemented (confirmed still out of scope)

- `SupervisorTask` — table exists, no CRUD endpoints (QA checklist workflow deferred).
- Password reset for Staff is a stub (generic response, no email/SMS delivery).
- No refresh-token flow for `User` (web portal) — re-login required on expiry (confirmed staying this way, §3.2).
- Geofence radius stays a hard-coded-default soft flag (§5.6); grace period stays hardcoded at 10 minutes — neither is configurable per outlet/campaign yet.
- No automated test suite yet.
- `SalesSummary`/`DailyStats` rollups are recomputed on every read (§5.2) — fine at current scale; worth revisiting (caching/materialized views) if a campaign's per-day item count grows very large.
- Staff HR fields stay at the current 11-field reduced set — the fuller ~30-field form and profile-photo upload are **not** planned for this version (confirmed decision, §2.4).
- No historical `TrackingPing` breadcrumb-table endpoint for the portal — only the live snapshot (`/tracking/live`) exists.
- No Distributor- or Brand-level `CampaignAccessGrant` scoping — campaign/outlet only.

---

## 9. Where this document's decisions came from

Every "confirmed v3" note above resolves a conflict that existed between this document's v2 predecessor and the now-retired `CampaignBuddy_Full_Backend_Contract.md`. The full reasoning, alternatives considered, and who/what confirmed each one is kept in `CampaignBuddy_Changelog_v3.md` — treat that file as the permanent decision log; this section of the spec states the *outcome* inline at point of use so implementers don't have to cross-reference the changelog for day-to-day work.
