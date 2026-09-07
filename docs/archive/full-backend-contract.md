# Campaign Buddy — Full Backend Contract Spec

**Version:** 2.1
**Status:** Confirmed with the backend owner — all §10 open decisions resolved (see §10 for the decision log) and ready to implement.
**Supersedes:** Reconciles and extends `CampaignBuddy_API_Spec.md` (v1.0, mobile) and
`CampaignBuddy_Unified_Backend_Spec.md` (v1.0, portal architecture). Where those two
docs are silent or ambiguous, this doc resolves it — because the resolution was
forced by actually building the web portal frontend against them. Where this doc
conflicts with either original, **this doc wins**.

**Why this doc exists:** the mobile app spec and the web portal frontend were built
from two different documents that described the same backend from two different
angles. Building the actual portal frontend surfaced ~15 endpoints the portal
needs that neither doc specified, one real naming collision (two different
things both called "User"), and a handful of response-shape decisions (mainly:
should list endpoints return bare foreign keys or denormalized display names)
that both the mobile team and the backend team need to agree on before all three
pieces plug into each other cleanly. This doc is the single place all three
surfaces should match against going forward.

---

## 1. How to use this doc

- §2–§4: architecture, conventions, and the canonical data model — read once.
- §5: Auth & RBAC for both principal types.
- §6: Mobile API (`/v1/*`) — unchanged from the original spec, summarized with a link back to it. **If you only touch the mobile backend, you don't need to read past §6.**
- §7: Portal API (`/admin/v1/*`) — the full catalog, including the endpoints this doc adds. **If you're building the portal backend, §7 is the bulk of your work.**
- §8: Denormalization checklist — a concrete list of fields every list endpoint must include so the portal doesn't need N+1 client-side joins.
- §9: Cross-surface enum/status table — the strings mobile writes and the portal reads (and vice versa) must match exactly.
- §10: Decision log — the questions this spec originally flagged, confirmed answers, and the reasoning kept for the record.

---

## 2. Architecture (unchanged from the Unified Backend Spec)

1. **One database, one core domain, three API surfaces.** Admin, Supervisor, and Sponsor are permission tiers over the same `/admin/v1/*` API — not separate backends, not separate route namespaces.
2. **Campaign is the tenancy boundary.** A `Client` sponsors several `Campaign`s; each has its own item catalog (`CampaignItem`), staff roster (`Activation`), and access grants.
3. **Two distinct principal types, two distinct tables — see the naming fix in §2.1.**
4. **Access control is campaign-and-outlet scoped**, via `CampaignAccessGrant`, not a blanket company-wide role.

### 2.1 ⚠️ Naming collision to resolve first

The original mobile spec's §2.1 `User` model (login, `employeeId`, `role: field_rep|campaign_owner|admin`) and the Unified Backend Spec's §2.14 `User` model (portal login, `username`/`roleId`) are **two different tables**. The Unified spec already renamed the mobile principal to `Staff` in its §2.7 — this doc makes that rename load-bearing:

| Table  | Who                                   | Logs in via                  | Never confuse with |
|--------|----------------------------------------|-------------------------------|---------------------|
| `Staff`  | Field promoters & supervisors (mobile app users) | `POST /v1/auth/login` (mobile) | the portal's `User` |
| `User`   | Admin / Supervisor / Sponsor portal accounts       | `POST /admin/v1/auth/login` (portal) | `Staff` |

A `Staff` member who is a Supervisor **may or may not** also have a `User` account for portal access — that's what `Staff.linkedUserId` (Unified spec §2.7) is for. Don't assume one implies the other.

### 2.2 Stack & infra (confirmed)

| | |
|---|---|
| Database | **MySQL** |
| Data | **Greenfield** — no migration from the old StaffPulse system; no legacy Clients/Outlets/Staff to backfill |
| API framework | **Slim 3 (PHP)** |
| Deployment | **Docker**, on a **Hetzner 4GB VPS** |
| File storage | **Local disk** on the server — item images and outlet-attendance visit photos are stored as files on the VPS and served as paths/URLs off the app server, not a bucket SDK. Given the 4GB VPS, keep an eye on disk usage as visit-photo volume grows; a retention/cleanup policy isn't specified yet but is worth planning before it's needed. |
| Build order | **Portal-facing endpoints first, then mobile-facing.** Nothing in this spec is deferred out of v1 — build the full catalog in §7, including all of §7.7's new endpoints. |

Modest VPS resources are a reason to keep the reporting endpoints (§7.5) doing
their aggregation in SQL rather than pulling raw rows and summing in PHP —
worth designing those queries deliberately rather than porting the portal
frontend's client-side grouping (§7.4.8) straight into the backend.

---

## 3. Conventions

Same as the mobile spec §1, applying to **both** `/v1/*` and `/admin/v1/*`:

| Aspect | Convention |
|---|---|
| Format | JSON, `Content-Type: application/json` |
| Auth | Bearer JWT, every endpoint except login/forgot-password/refresh |
| IDs | UUID v4 strings |
| Date | `YYYY-MM-DD` |
| Date-time | ISO 8601 UTC, `Z` suffix |
| Currency | Integer, whole LKR |
| Booleans | `true`/`false` |

**Response envelope** (identical on both surfaces):
```json
// success (single)
{ "data": { ... } }
// success (list)
{ "data": [ ... ], "meta": { "total": 24 } }
// error
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "field": "soldToday" } }
```

**Portal-only addition — pagination.** Every `/admin/v1/*` list endpoint must accept:
```
?page=1&pageSize=25&search=<text>
```
and return `meta.total` as the *unfiltered-by-page* count, so the frontend can compute total pages. `search` (when present) is a free-text match against whatever field the list's own UI table searches (e.g. Client Name for `/clients`, Outlet Name for `/outlets`) — see §7 per-endpoint notes for which field.

**Standard HTTP codes:** 200 / 201 / 204 / 400 / 401 / 403 / 404 / 409 / 422 / 500 — unchanged from mobile spec §1.2.

**Common error codes**, extended:
`VALIDATION_ERROR`, `NOT_CHECKED_IN`, `ALREADY_CHECKED_IN`, `LOCATION_OUT_OF_RANGE`, `OVERLAPPING_LEAVE_REQUEST`, `INSUFFICIENT_STOCK`, `TOKEN_EXPIRED`, `FORBIDDEN`, plus **new for the portal**: `CAMPAIGN_ACCESS_DENIED` (no `CampaignAccessGrant` for this campaign — maps to 403), `OUTLET_ACCESS_DENIED` (outlet not in grant's `outletScope` — maps to 403), `READ_ONLY_ROLE` (write attempted by `supervisor`/`sponsor` — maps to 403).

---

## 4. Canonical Data Models

This section is the merge of mobile spec §2 and Unified spec §2, with denormalized
fields called out explicitly (see §8 for the full rationale). Fields marked
**(new)** don't appear in either prior doc but are required by the portal
frontend as built.

### 4.1 Client
`id, companyName, clientName, contactNumber, email, address`

### 4.2 Brand
`id, name, clientId`

### 4.3 Item
`id, brandId, sku, name, unitPrice, reorderLevel, imageUrl, description, attributes[], supplierName`
**(new, denormalized)** `brandName` — see §8.

### 4.4 Campaign
`id, campaignNo, name, clientId, description, startDate, endDate, status (upcoming|active|ended), timezone`
**(new, denormalized)** `clientName`.
**Confirmed:** `status` is **purely computed** from `startDate`/`endDate` vs. today — no Admin override, no stored column needed. Compute at read time: `today < startDate → upcoming`; `startDate ≤ today ≤ endDate → active`; `today > endDate → ended` (using the campaign's `timezone`).

### 4.5 CampaignItem (join)
`id, campaignId, itemId`
`POST /campaigns/{id}/items` accepts **either** `{ "itemId": "..." }` (link existing) **or** `{ "newItem": { name, brandId, unitPrice, reorderLevel, description } }` (create + link in one call) — per Unified spec §4.2.

### 4.6 Outlet
`id, name, contactPerson, address, cityId, phone, mobile, fax, latitude, longitude, geofenceRadiusMeters`
**(new, denormalized)** `cityName`.
**Confirmed:** if `geofenceRadiusMeters` is null, the check-in flow (§4.13) defaults to **200 meters**.

### 4.7 DistributorPoint
`id, name, contact, address, cityId, clientId`
**(new, denormalized)** `cityName`, `clientName`.

### 4.8 City
`id, name, province, district` — fixed lookup lists: 9 provinces, 25 districts (see Admin Panel spec §3.4.3 for the full district list; reproduced in the portal frontend's `config/resources.jsx`).

### 4.9 Staff *(mobile login — see §2.1 naming fix)*
`id, employeeId, fullName, displayName, userType (promoter|supervisor), mobileUsername, phone, cityId, status (active|inactive), reportsToStaffId, linkedUserId (nullable)`
Plus HR sub-objects (EmergencyContact, BankAccount, Skills, WorkDetails) per Admin Panel spec §3.5.1 — **confirmed in scope for v1** (§10.3): the full record. The portal frontend's Add/Edit Staff form now covers all of it (§4.9.1).
**(new, denormalized)** `cityName`.

`GET /staff?search=` — the portal calls this with an **empty string** to mean "all staff" (used to populate every Promoter/Supervisor dropdown across the portal). **Confirm empty `search` returns the full pool** (paginated), not an empty result — this is load-bearing for ~8 different dropdowns in the portal.

#### 4.9.1 Full Staff field list (as the portal's form now sends it)

These field names are the portal frontend's choice (`config/resources.jsx` →
`staff.formFields`), not verbatim from either prior spec doc — **this is the
one place a backend column-naming mismatch is most likely**, so reconcile
before first test rather than after.

| Section | Fields |
|---|---|
| Basic Info | `fullName, displayName, gender (female\|male), dateOfBirth (date), nic, profilePictureUrl (read-only — see below), permanentAddress, currentAddress, cityId, telephone, phone, mobileType (smart\|normal), email, maritalStatus (non_married\|married)` |
| Emergency Contact | `emergencyContactName, emergencyContactNo` |
| Bank Account | `bankAccountName, bankName, bankAccountNumber, bankBranch` |
| Skills & Qualifications | `educationQualification, workExperience, otherSkills, interestsHobbies, englishSpeaking (high\|medium\|poor), englishReading (high\|medium\|poor), englishWriting (high\|medium\|poor)` |
| Work Details | `workingType (weekdays_only\|daily\|outstation), supplierName, mobileUsername, designation (free text — portal offers a fixed pick-list of "Category Assistant" / "Beauty Category Assistant" / "Supervisor" plus a custom option, but sends whatever string results), userType (promoter\|supervisor), status (active\|inactive)` |

**Confirmed: the profile picture is a separate endpoint, not part of the
`POST`/`PATCH /staff` JSON body.** `POST /staff` and `PATCH /staff/{id}` stay
plain JSON like every other endpoint in this spec; `Staff.profilePictureUrl`
is a read-only field set only via:

```
POST /admin/v1/staff/{staffId}/photo
Content-Type: multipart/form-data
  photo: <file>
→ { "data": { "profilePictureUrl": "/uploads/staff/{staffId}.jpg" } }
```

Given local-disk storage (§2.2), `profilePictureUrl` is whatever path/URL the
server serves that file back at. The portal's Add/Edit Staff flow calls
`POST /staff` (or `PATCH /staff/{id}`) first, then — only if the admin picked
a new file — calls this endpoint with the new staff/edited staff's id.
Editing a Staff record without touching the photo never calls this endpoint
at all.

### 4.10 Activation *(replaces mobile spec's `Assignment`)*
`id, name, campaignId, outletId, staffId, supervisorStaffId (nullable), distributorPointId (nullable), dateFrom, dateTo, targetType (item_wise|brand_wise), targetCategorization (daily|monthly), targetUnit (unit_wise|sales_wise), shiftStart, shiftEnd`
**(new, denormalized)** `outletName`, `staffName`, `supervisorName`.


### 4.11 ActivationItem (join)
`id, activationId, campaignItemId, addedAt`
**⚠️ See §7.3.4 — this needs a GET and DELETE, which neither prior doc specifies.**

### 4.12 ActivationTarget
`id, activationId, dateFrom, dateTo, repeat (boolean), targetItemId, targetValue`

### 4.13 AttendanceRecord
`id, staffId, activationId, date, checkInAt, checkInLat, checkInLng, checkInLocationVerified, checkOutAt, checkOutLat, checkOutLng, salesSummaryConfirmedAtCheckout, status (on_time|late|leave|absent|pending), leaveRequestId (nullable)`
**(new, denormalized)** `staffName`, `outletName` (via the record's `activationId → outletId`).

**Confirmed business rules:**
- **Late:** `status = 'late'` when `checkInAt > Activation.shiftStart + 1 hour`. Anything at or before the 1-hour grace period is `on_time`.
- **Geofencing is a soft flag, not a block.** `checkInLocationVerified` (boolean) is set to `false` when the check-in coordinates fall outside `Outlet.geofenceRadiusMeters` (or the 200m default — §4.6), but **check-in is never rejected for this reason.** The Attendance tables (mobile + portal) surface unverified check-ins for review; they don't prevent them.

### 4.14 LocationPing / TrackingPing
`id, staffId, latitude, longitude, accuracyMeters (nullable), capturedAt, receivedAt, appState (foreground|background), batteryPercent (nullable)`
**Live tracking (`GET /campaigns/{id}/tracking/live`)** returns only pings from staff currently checked in (open `AttendanceRecord`), one row per staff member (their latest ping), with `staffName` and `outletName` denormalized.
**Historical tracking is a separate, new endpoint — see §7.4.5.**

### 4.15 DailyStats
`id, staffId, activationId, date, footFall, approached, converted, totalSales (read-only, server-computed), updatedAt`
**(new, denormalized) `outletId`.** Neither prior doc puts `outletId` directly on `DailyStats` (it's only reachable via `activationId → outletId`), but the portal's Outlet Wise report and dashboard both need to group by outlet without an extra join per row — **add `outletId` (and ideally `outletName`) directly to this response.**

**Confirmed formula:** `totalSales = Σ (SalesRecord.soldToday × Item.unitPrice)` across that staff member's items for the date. Nothing else feeds into it — no discounts, no returns/refunds logic exists in v1.

### 4.16 Product / Item pricing note
`totalSales` on `DailyStats` and `SalesRecord.remainingStock` remain server-computed everywhere, never accepted from any client (mobile or portal) — unchanged rule from mobile spec §10.2.

### 4.17 SalesRecord *(replaces mobile spec's `StockEntry`)*
`id, activationItemId, date, openingStock, soldToday (≤ openingStock), otherInterestedCustomers, reorderFlag, remainingStock (read-only), updatedAt`
**(new, denormalized)** `itemName`, `unitPrice`, `outletId`, `staffId` — the portal's SKU Wise Sales and Update Sales screens both need to display and filter by item/outlet/promoter without resolving `activationItemId → campaignItemId → itemId` client-side on every row.

**Confirmed: mid-day restock is handled by editing `openingStock` in place**, not by creating a second `SalesRecord` row for the same `activationItemId`/`date`. There is no separate "restock" entity. The `soldToday ≤ openingStock` constraint is validated against the **current** value of `openingStock` at the time of the update — if a promoter (mobile) or an Admin correction (portal, `PATCH /campaigns/{id}/sales/{salesRecordId}`) raises `openingStock` mid-day, `soldToday` can then legally exceed what the *morning's* opening stock was, as long as it doesn't exceed the *current* value. Both mobile's stock-update endpoint and the portal's Update Sales screen (§7.7.4) need to allow editing `openingStock`, not just `soldToday`.

### 4.18 SalesSummary
Unchanged from mobile spec §2.11: `id, staffId, activationId, date, itemsReceived, itemsSold, itemsRemaining, totalSales, footFall, approached, converted, remarks, confirmed, confirmedAt`.

### 4.19 TimeOffRequest / LeaveRequest
`id, staffId, fromDate, toDate, days (read-only), reason (sick_leave|annual_leave|personal|other), note, status (pending|approved|declined), approverId, approverName, createdAt, decidedAt`
**(new, denormalized)** `staffName`.
**(new)** `PATCH /campaigns/{id}/leave-requests/{id}` body: `{ "status": "approved" | "declined" }` — the Unified spec §4.4 lists this endpoint but doesn't give its body shape; this is what the portal sends.

### 4.20 SupervisorTask
`id, campaignId, category (enum, see Admin Panel spec §3.7.1), taskType (range|feedback), task (text)` — **this whole entity has no endpoint in the Unified spec at all; see §7.7.3.**

### 4.21 User *(portal login — see §2.1 naming fix)*
`id, username, passwordHash, displayName, email, roleId, isActive, createdAt`

### 4.22 Role
`id, label, description, modules[], functionality[], defaultUrl, isActive`
Known `id`s: `adm`, `client`, `super`, `usr` (legacy, from the original StaffPulse admin) plus `supervisor`, `sponsor` (added by the Unified spec §2.15).

### 4.23 CampaignAccessGrant
`id, userId, campaignId, outletScope ("all" | outletId[]), createdAt`

---

## 5. Auth & RBAC

### 5.1 Mobile (`Staff`) — unchanged
`POST /v1/auth/login` → JWT, self-scoped. See mobile spec §3 in full; nothing here changes it.

### 5.2 Portal (`User`) — unchanged from Unified spec §3, restated for completeness
```
POST /admin/v1/auth/login
{ "username": "...", "password": "..." }
→ { "data": { "accessToken": "...", "refreshToken": "...", "user": { "id", "displayName", "roleId", "defaultUrl" } } }
```
Every `/admin/v1/campaigns/{campaignId}/...` request is authorized in three steps: campaign check (`CampaignAccessGrant` exists?) → outlet check (resource's `outletId` in `outletScope`?) → write check (`adm`/`usr`/`super` full CRUD; `supervisor`/`sponsor` read-only **enforced server-side**, not just hidden in the UI — the portal frontend hides write buttons for these roles, but a hidden button is not access control).

**(new) `POST /admin/v1/auth/logout`** — the portal calls this on sign-out. Mobile already has this at `/v1/auth/logout`; the portal needs its own at `/admin/v1/auth/logout`. Body: `{}`. Response: `204`.

**Confirmed: build `POST /admin/v1/auth/refresh`, mirroring the mobile flow.**
```
POST /admin/v1/auth/refresh
{ "refreshToken": "..." }
→ { "data": { "accessToken": "...", "refreshToken": "..." } }
```
**Confirmed: JWT expiry is the same lifetime for both `Staff` (mobile) and `User` (portal) tokens** — one token-lifetime config value, not two.

**Confirmed: portal `User` passwords are set directly by an Admin** when creating the account (matches the current Add User form — a plain `password` field, hashed server-side into `passwordHash` at rest). No invite-email / self-service password flow in v1.

### 5.3 Campaign switcher
`GET /admin/v1/campaigns` (no `campaignId` in the path — this is the *list* endpoint from §4.2) must return **only campaigns the caller has a `CampaignAccessGrant` for**. This list populates the portal's top-bar campaign switcher directly — there is no separate "my campaigns" endpoint. `noAdd`/read-only campaigns still appear here for Supervisor/Sponsor; the grant simply won't include write permission.

---

## 6. Mobile API (`/v1/*`) — reference only

Unchanged from `CampaignBuddy_API_Spec.md` §3–§9 in full. Summarized for cross-reference:

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/login`, `/auth/refresh`, `/auth/forgot-password`, `/auth/logout` |
| Profile | `GET /me`, `GET /me/assignments/today` |
| Attendance & Location | `GET /attendance/today`, `POST /attendance/check-in`, `POST /attendance/check-out`, `GET /attendance/history`, `POST /location/ping` |
| Stats, Products & Stock | `GET/PATCH /stats/today`, `GET /campaigns/{id}/outlets/{id}/products`, `GET /products/{id}`, `PATCH /products/{cpaId}/stock` |
| Sales Summary | `GET/PATCH /sales-summary/today`, `POST /sales-summary/today/confirm` |
| Time Off | `GET /time-off/balance`, `GET/POST /time-off/requests` |
| Performance | `GET /campaigns/{id}/performance` |

**One rename to apply here even though the mobile spec's endpoint shapes don't change:** every place the mobile spec's data model doc (§2) said `Assignment`, `User`, `Product`, `StockEntry`, read it as `Activation`, `Staff`, `Item`, `SalesRecord` per §4 above — the endpoint paths and payloads are unaffected, only the backing table names.

---

## 7. Portal API (`/admin/v1/*`) — full catalog

Sections 7.1–7.6 restate the Unified Backend Spec §4 endpoints **exactly as the
portal frontend calls them** (confirms no drift). Section 7.7 specifies the
endpoints the portal needs that neither prior doc defined.

### 7.1 Catalog

| Method | Path | Notes |
|---|---|---|
| GET/POST | `/clients` | search field: `clientName` |
| PATCH/DELETE | `/clients/{id}` | |
| GET/POST | `/brands` | |
| PATCH/DELETE | `/brands/{id}` | |
| GET/POST | `/items` | search field: `name` |
| PATCH/DELETE | `/items/{id}` | |
| GET/POST | `/outlets` | search field: `name` |
| PATCH/DELETE | `/outlets/{id}` | |
| GET/POST | `/distributor-points` | |
| PATCH/DELETE | `/distributor-points/{id}` | |
| GET/POST | `/cities` | |
| PATCH/DELETE | `/cities/{id}` | |

### 7.2 Campaign setup

| Method | Path | Notes |
|---|---|---|
| GET/POST | `/campaigns` | scoped to caller's grants; search field: `name` |
| GET/PATCH/DELETE | `/campaigns/{id}` | |
| GET | `/campaigns/{id}/items` | |
| POST | `/campaigns/{id}/items` | `{itemId}` or `{newItem:{...}}` |
| DELETE | `/campaigns/{id}/items/{campaignItemId}` | |

### 7.3 Staff & Activations

| Method | Path | Notes |
|---|---|---|
| GET | `/staff?search=` | empty search = full pool (see §4.9 note); response includes the full HR field set — see §4.9.1 |
| POST | `/staff` | full HR payload, §4.9.1 — plain JSON, no photo |
| PATCH/DELETE | `/staff/{id}` | |
| POST | `/staff/{id}/photo` | `multipart/form-data`, field `photo` — see §4.9.1 |
| GET/POST | `/campaigns/{id}/activations` | |
| GET/PATCH/DELETE | `/campaigns/{id}/activations/{activationId}` | |
| POST | `/campaigns/{id}/activations/{activationId}/items` | body: `{ "campaignItemIds": ["...", "..."] }` — **portal always sends an array**, even for a single item (see 7.3.4) |
| GET/POST | `/campaigns/{id}/activations/{activationId}/targets` | |

#### 7.3.4 ⚠️ Gap: ActivationItem needs a GET and a DELETE

The Unified spec §4.3 only lists the `POST` above. As built, the portal's
Activation Items screen can *attach* items but has no way to show what's
already attached after a page reload, or to detach one. **Add:**

```
GET /admin/v1/campaigns/{campaignId}/activations/{activationId}/items
→ { "data": [ { "id", "activationId", "campaignItemId", "itemName", "unitPrice", "addedAt" }, ... ] }

DELETE /admin/v1/campaigns/{campaignId}/activations/{activationId}/items/{activationItemId}
→ 204
```

#### 7.3.5 Confirmed: auto-provisioning `CampaignAccessGrant` on supervisor assignment

When `POST /campaigns/{id}/activations` or `PATCH .../activations/{activationId}` sets
`supervisorStaffId` to a `Staff` record that has `linkedUserId` populated, the
backend should **automatically create a `CampaignAccessGrant`** for that `User`
on that `campaignId` if one doesn't already exist — no separate manual step via
§7.6 required. **Default `outletScope`: `"all"`** for the campaign (not just the
one outlet on this Activation) — a supervisor is likely to pick up other
outlets on the same campaign over time, and re-granting per-outlet on every new
Activation adds friction for no real security benefit within a single
campaign. If `linkedUserId` is null (this supervisor has no portal account),
this is a no-op — don't create a `User` record implicitly.

Assigning a Sponsor's `User` to a campaign remains a manual step via §7.6 —
there's no equivalent auto-provisioning trigger for Sponsors, since a Sponsor
isn't set as a field on `Activation` anywhere. **Confirmed: a Campaign can have
more than one Sponsor `User`** — no uniqueness constraint needed on
`CampaignAccessGrant.campaignId` for `sponsor`-role users.

### 7.4 Attendance, Sales & Tracking

| Method | Path | Notes |
|---|---|---|
| GET | `/campaigns/{id}/attendance?outletId=&dateFrom=&dateTo=` | see §4.13 for denormalization |
| GET | `/campaigns/{id}/sales?outletId=&dateFrom=&dateTo=` | see §4.17 |
| PATCH | `/campaigns/{id}/sales/{salesRecordId}` | body: `{ "openingStock": n, "soldToday": n }` (Admin correction — portal's Update Sales screen sends both together) |
| GET | `/campaigns/{id}/stats?outletId=&dateFrom=&dateTo=` | see §4.15 — **must include `outletId`** |
| GET | `/campaigns/{id}/tracking/live` | see §4.14 |
| GET | `/campaigns/{id}/leave-requests` | |
| PATCH | `/campaigns/{id}/leave-requests/{id}` | body: `{ "status": "approved"|"declined" }` |

#### 7.4.5 ⚠️ Gap: historical GPS tracking

The Unified spec only defines *live* tracking. The Admin Panel Feature Spec
§3.9 documents two screens (Promoter Tracking, Supervisor Tracking) that show
a raw breadcrumb trail — these need a history endpoint:

```
GET /admin/v1/campaigns/{campaignId}/tracking/promoter-history?staffId=&date=
→ { "data": [ { "staffId", "capturedAt", "latitude", "longitude" }, ... ] }

GET /admin/v1/tracking/supervisor-history?staffId=&date=
→ { "data": [ { "staffId", "capturedAt", "latitude", "longitude" }, ... ] }
```
**Confirmed: Supervisor tracking stays genuinely global**, no `campaignId` in
the path — matching the Admin Panel spec §3.9.2 as written, not scoped per
campaign like everything else. A supervisor's breadcrumb trail is queried
across all their campaigns at once (see §10.4 for the record).

#### 7.4.6 ⚠️ Gap: Staff Absence report

Admin Panel spec §3.5.3. Derived report — promoters scheduled (have an
`Activation` covering the date) but with no `AttendanceRecord.checkInAt` for it:

```
GET /admin/v1/campaigns/{campaignId}/absence?date=YYYY-MM-DD
→ { "data": [ { "activationId", "activationName", "outletId", "outletName", "staffId", "staffName" }, ... ] }
```

#### 7.4.7 ⚠️ Gap: Outlet Attendance (supervisor visit log)

Admin Panel spec §3.7.2 — distinct from `staffAttendance` (7.4): this is the
*supervisor's* check-in/out at an outlet, cross-referenced against the
promoter they're visiting, plus a proof-of-visit photo:

```
GET /admin/v1/campaigns/{campaignId}/outlet-attendance?date=YYYY-MM-DD
→ { "data": [ { "id", "supervisorStaffId", "supervisorName", "staffId", "staffName",
              "outletId", "outletName", "checkInAt", "checkOutAt", "photoUrl" }, ... ] }
```

#### 7.4.8 ⚠️ Gap: Outlet Wise sales rollup

Admin Panel spec §3.6.3. The portal currently derives this client-side by
summing `DailyStats` per outlet — **fine for a small campaign, won't scale.**
Recommend a real endpoint:

```
GET /admin/v1/campaigns/{campaignId}/reports/outlet-wise?outletId=&duration=daily|weekly|monthly
→ { "data": [ { "outletId", "outletName", "footFall", "totalSales" }, ... ] }
```

### 7.5 Reporting

| Method | Path | Response shape (not specified in Unified spec — this is what the portal expects) |
|---|---|---|
| GET | `/campaigns/{id}/reports/sku-wise?dateFrom=&dateTo=` | `{ "data": [ { "itemId", "itemName", "brandName", "itemCount", "totalSales" }, ... ] }` |
| GET | `/campaigns/{id}/reports/brand-wise` | `{ "data": [ { "brandId", "brandName", "itemCount", "totalSales" }, ... ] }` |
| GET | `/campaigns/{id}/reports/reorder?date=` | `{ "data": [ { "activationId", "activationName", "itemId", "itemName", "outletId", "outletName", "date" }, ... ] }` |
| GET | `/campaigns/{id}/reports/attendance-monthly?month=YYYY-MM` | see 7.5.1 |

#### 7.5.1 Monthly Attendance response shape

Admin Panel spec §3.13 — a per-promoter, per-day grid. The portal expects:
```json
{
  "data": {
    "days": [1, 2, 3, "...", 30],
    "rows": [
      { "staffId": "...", "staffName": "Sanduni Kumari", "outletName": "Nawala Retail Outlet",
        "days": { "1": "✓", "2": "✓", "3": "A", "4": "—" } }
    ]
  }
}
```
(`"✓"` present, `"A"` absent, `"—"` on leave, day omitted or `null` = not yet started.)

#### 7.5.2 Client/Sponsor-scoped report variants

Admin Panel spec §3.11 (`item_wise_c`, `brand_wise_c` — outlet-filtered
versions of the reports above, for the Sponsor role):

```
GET /admin/v1/campaigns/{campaignId}/reports/sku-wise-client?outletId=
GET /admin/v1/campaigns/{campaignId}/reports/brand-wise-client?outletId=
```
Same response shapes as 7.5's sku-wise/brand-wise. **Confirmed: kept as
separate endpoints**, matching the original admin panel — not merged into
`/reports/sku-wise` with automatic grant-based filtering (that alternative was
considered and declined; see §10.2 for the record).

### 7.6 RBAC administration

| Method | Path | Notes |
|---|---|---|
| GET/POST | `/users` | `POST` body includes a plaintext `password` field, set directly by the Admin (§5.2) — hash it server-side, never echo it back in the response |
| PATCH | `/users/{id}` | |
| GET/POST | `/users/{id}/campaign-access` | grant/revoke `CampaignAccessGrant`; also auto-invoked — see §7.3.5 |
| GET/POST | `/roles` | |
| PATCH | `/roles/{id}` | |

### 7.7 New endpoints with no home in either prior doc

These back Admin Panel screens (§3.5.5, §3.7.1, §3.7.4) that the Unified
Backend Spec's §4 simply doesn't mention — presumably an oversight in scoping
that doc to "what changed from the mobile API," not "everything the admin
panel does."

#### 7.7.1 Staff Profiles (performance evaluation)

Admin Panel spec §3.5.5:
```
GET /admin/v1/staff/{staffId}/evaluation?dateFrom=&dateTo=
→ { "data": {
      "overallPerformancePct", "attendancePct", "totalSales", "totalItems",
      "avgSalesPerMonth", "highestDailySales", "highestPerformingDate",
      "brandContribution": [ { "brandName", "percent" }, ... ]
  } }
```

#### 7.7.2 Supervisor Tasks (QA checklist)

Admin Panel spec §3.7.1 — see `SupervisorTask` model §4.20:
```
GET  /admin/v1/campaigns/{campaignId}/supervisor-tasks
→ { "data": [ { "id", "category", "taskType", "task" }, ... ] }
POST /admin/v1/campaigns/{campaignId}/supervisor-tasks
  body: { "category", "taskType": "range"|"feedback", "task" }
PATCH  /admin/v1/campaigns/{campaignId}/supervisor-tasks/{id}
DELETE /admin/v1/campaigns/{campaignId}/supervisor-tasks/{id}
```
**Confirmed: portal-only configuration.** These are questions a supervisor
answers on paper or some other channel outside this system — the mobile app
does **not** need endpoints to record answers to them in v1. This is CRUD
only; nothing reads these from the mobile side (see §10.5 for the record).

#### 7.7.3 Assign Routes (supervisor route planning)

Admin Panel spec §3.7.4:
```
GET  /admin/v1/supervisor-routes?supervisorId=&outletId=&dateFrom=&dateTo=
→ { "data": [ { "id", "supervisorStaffId", "outletId", "outletName", "date" }, ... ] }
POST /admin/v1/supervisor-routes
  body: { "supervisorStaffId", "outletIds": ["...", "..."], "dateFrom", "dateTo" }
```

#### 7.7.4 Update Sales lookup

Admin Panel spec §3.6.4 — the cascading-dropdown load step before the
editable grid. The *save* uses the already-documented
`PATCH /campaigns/{id}/sales/{salesRecordId}` (§7.4); this is just the load:
```
GET /admin/v1/sales/lookup?campaignId=&staffId=&outletId=&activationId=&date=
→ { "data": [ { "id" (=salesRecordId), "itemName", "unitPrice", "openingStock", "soldToday" }, ... ] }
```

---

## 8. Denormalization checklist

**Recommendation: denormalize these onto the list response directly**, rather
than making the portal fetch every Staff/Outlet/Brand list separately and
join client-side. The portal frontend does this join today as a stopgap
(`hydrate()` in `config/resources.jsx`) and it works, but it means every
Activations page load fires 2 extra full-table fetches (`/staff`, `/outlets`)
just to show names instead of UUIDs — it won't hold up once those lists have
hundreds of rows.

| Response | Add these fields |
|---|---|
| `Item` | `brandName` |
| `Campaign` | `clientName` |
| `Outlet` | `cityName` |
| `DistributorPoint` | `cityName`, `clientName` |
| `Staff` | `cityName` |
| `Activation` | `outletName`, `staffName`, `supervisorName` |
| `AttendanceRecord` | `staffName`, `outletName` |
| `DailyStats` | `outletId`, `outletName` |
| `SalesRecord` | `itemName`, `unitPrice`, `outletId`, `staffId` |
| `LeaveRequest` | `staffName` |
| live `TrackingPing` | `staffName`, `outletName` |

If full denormalization isn't feasible before first integration test, the
fallback (bare foreign keys only) still works — the portal already handles
it — but plan to close this gap before real data volume shows up.

---

## 9. Cross-surface enum / status consistency

These strings are written by one surface and read by another (or by a report
aggregation) — **any drift here silently breaks a screen**, not throws an
error, since neither side validates the other's enum:

| Field | Values | Written by | Read by |
|---|---|---|---|
| `Activation.targetType` | `item_wise`, `brand_wise` | Portal (Add Activation form) | Backend (target calc), mobile (Performance) |
| `Activation.targetCategorization` | `daily`, `monthly` | Portal | Backend |
| `Activation.targetUnit` | `unit_wise`, `sales_wise` | Portal | Backend, mobile (Performance display) |
| `AttendanceRecord.status` | `on_time`, `late`, `leave`, `absent`, `pending` | Backend (computed at check-in) | Mobile (Attendance history chips — **only uses `on_time`/`leave` per the mobile redesign, see design notes**), Portal (Staff Attendance table) |
| `LeaveRequest.status` | `pending`, `approved`, `declined` | Backend (on decision) | Mobile, Portal |
| `LeaveRequest.reason` | `sick_leave`, `annual_leave`, `personal`, `other` | Mobile (request creation) | Portal (Leave Requests table) |
| `Staff.userType` | `promoter`, `supervisor` | Portal (Add Staff form) | Backend (RBAC-adjacent: who can be assigned as `supervisorStaffId`), Portal (Staff list badge) |
| `Staff.status` | `active`, `inactive` | Portal | Backend (login gating) |
| `Campaign.status` | `upcoming`, `active`, `ended` | Backend (computed from dates, presumably) | Portal (status badge) |
| `SupervisorTask.taskType` | `range`, `feedback` | Portal (Add Task form) | Portal only — **confirmed the mobile app does not read this in v1** (§10.5) |
| `User.roleId` | `adm`, `usr`, `super`, `client`, `supervisor`, `sponsor` | Portal (Users/Roles admin) | Portal itself (`AuthContext.roleToPersona` — see below) |

**`roleId` → UI persona mapping** (portal's `AuthContext.jsx`, restated here so
backend and frontend never drift on this):
```
adm, usr, super  → "admin"       (full CRUD)
supervisor       → "supervisor"  (read-only, outlet-scoped)
sponsor, client  → "sponsor"     (read-only, campaign-scoped)
anything else    → "supervisor"  (safest default: read-only)
```
If a new `roleId` is added via `POST /roles`, it falls into the safe
read-only default until this mapping is updated — **flag any new role to the
frontend team**, don't assume it auto-classifies correctly.

---

## 10. Decision log

All decisions below were confirmed directly with the backend owner. Kept as a
log (not deleted) so the reasoning behind each is still visible — if one of
these needs revisiting later, this is the history.

### 10.1 Portal token refresh — ✅ DECIDED: build it
Build `POST /admin/v1/auth/refresh` now, mirroring the mobile flow. See §5.2
for the request/response shape. JWT expiry is the same lifetime for both
`Staff` and `User` tokens.

### 10.2 Client-scoped reports: separate endpoints or automatic filtering? — ✅ DECIDED: separate endpoints
Kept as two distinct routes (`/reports/sku-wise-client` vs
`/reports/sku-wise`), matching the original admin panel, rather than merging
into one grant-filtered endpoint. See §7.5.2.

### 10.3 Staff form completeness — ✅ DECIDED: full HR record
Build the full ~30-field record from Admin Panel spec §3.5.1 (Emergency
Contact, Bank Details, Skills, Work Details), not just the condensed
mobile-login subset. **Done:** the portal frontend's Add/Edit Staff form now
covers all of it, organized into the same five sections as the field names
in §4.9.1 — reconcile those field names against the real `Staff` table
before first test.

### 10.4 Supervisor tracking — campaign-scoped or global? — ✅ DECIDED: global
Kept as a genuinely global endpoint (no `campaignId` in the path), matching
Admin Panel spec §3.9.2 as written. See §7.4.5.

### 10.5 SupervisorTask — does the mobile app read it? — ✅ DECIDED: no
Portal-only configuration; answers are captured outside this system (paper or
another tool). No mobile endpoints needed for this in v1. See §7.7.2.

### 10.6 Staff-to-Activation cardinality — ✅ DECIDED: concurrent Activations allowed
A `Staff` member **can** have concurrent open `Activation`s across two
campaigns on the same day — no double-booking check at check-in, and the
portal's Activation form doesn't need to warn on this either.

### 10.7 CampaignAccessGrant auto-provisioning — ✅ DECIDED: auto-grant
When a `Staff` member with `linkedUserId` set is assigned as
`supervisorStaffId` on an Activation, auto-create their `CampaignAccessGrant`
(default `outletScope: "all"` for that campaign) rather than requiring a
separate manual step. Full spec at §7.3.5.

### 10.8 Sponsor multiplicity — ✅ DECIDED: multiple sponsors allowed
One Campaign can have more than one Sponsor `User` logged in — no uniqueness
constraint on `CampaignAccessGrant` for `sponsor`-role users.

### 10.9 Business-rule constants — ✅ DECIDED (new — not in the original open-decisions list, but resolved alongside them)
- **Late check-in grace period:** 1 hour after `Activation.shiftStart` (§4.13).
- **Default geofence radius:** 200 meters when `Outlet.geofenceRadiusMeters` is null (§4.6), and geofencing is a **soft flag** — it never blocks check-in (§4.13).
- **Mid-day restock:** handled by editing `SalesRecord.openingStock` in place, not a new row (§4.17).
- **`DailyStats.totalSales`:** pure `Σ(soldToday × unitPrice)`, no discounts or returns logic in v1 (§4.15).
- **`Campaign.status`:** purely computed from dates, no Admin override (§4.4).

### 10.10 Staff profile photo — ✅ DECIDED: separate upload endpoint
`POST /staff` and `PATCH /staff/{id}` stay plain JSON. The profile picture is
set via its own `POST /staff/{id}/photo` (`multipart/form-data`), keeping
every other endpoint in this spec uniformly JSON. See §4.9.1 for the full
shape.

---

## 11. What to test first, once a backend is up

In roughly the order that will surface the most integration bugs fastest:

1. **Auth** — both `/v1/auth/login` (mobile) and `/admin/v1/auth/login`
   (portal), confirm the `roleId → persona` mapping (§9) actually lands users
   on a sidebar that matches their grants.
2. **`GET /campaigns`** — confirm it's truly grant-scoped (log in as a
   `supervisor` or `sponsor` test user with only one grant, confirm the
   campaign switcher shows exactly one option).
3. **`GET /staff?search=`** — confirm empty search returns the full pool
   (§4.9) — this silently breaks ~8 dropdowns across the portal if it doesn't.
4. **Activations list + hydrate** — create one Activation via the portal,
   confirm `outletId`/`staffId`/`supervisorStaffId` round-trip correctly and
   the list shows real names (either via denormalization per §8, or via the
   frontend's fallback join — confirm at least one path works end to end).
5. **Write-blocking for read-only roles** — log in as `supervisor`/`sponsor`,
   attempt a raw `POST`/`PATCH`/`DELETE` against any `/admin/v1/*` write
   endpoint directly (not through the UI, which already hides the button) and
   confirm the backend returns `403 READ_ONLY_ROLE`. This is the one check
   that *must* happen server-side — see §5.2.
6. Everything under §7.7 (the genuinely new endpoints) — these have no prior
   implementation anywhere to fall back on, so they're the highest-risk
   surface for shape mismatches on first integration.
7. **Auto-provisioning (§7.3.5)** — assign a Supervisor with a `linkedUserId`
   to an Activation, confirm their `User` immediately gets a
   `CampaignAccessGrant` with `outletScope: "all"` for that campaign, without
   a separate manual grant step.
8. **Refresh flow (§5.2)** — let a portal access token expire (or force a
   401), confirm `POST /admin/v1/auth/refresh` returns a working new token
   pair rather than forcing a re-login.
9. **Late/geofence flags** — check in more than 1 hour after
   `Activation.shiftStart` and confirm `status = 'late'`; check in from
   outside the geofence radius and confirm the check-in **succeeds** with
   `checkInLocationVerified = false` rather than being rejected.
10. **Mid-day stock edit** — PATCH `openingStock` upward mid-day on an
    existing `SalesRecord`, then submit `soldToday` above the *original*
    opening stock but below the *new* one, and confirm it's accepted.

Since the build order is **portal-facing first, then mobile**, items 1–8
above are all testable before any mobile endpoint work begins — worth running
through them as a checkpoint before starting §6.
