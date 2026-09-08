# Campaign Buddy Admin Panel — Full Feature & Field-Level Specification (v3)

Source: live audit of `admin.staffpulse.lk` (logged in as `dyuro`, role "Dyuro"/super), September 2026 — reconciled against **`CampaignBuddy_Backend_Spec_v3.md`**, the now-unified backend spec, so the rebuild's UI matches the actual data model and RBAC mechanism.

Purpose: complete reference for rebuilding the dashboard with new design principles, so no field, filter, or workflow is lost — reflecting that this is one web app serving three personas (Admin, Supervisor, Sponsor) via a single grant-based access model.

**What's new in v3, over v2 of this doc:**
- **Assign Routes (§3.7.4) is no longer a gap** — it's backed by the new `SupervisorRoute` model and campaign-scoped endpoints in Backend Spec v3 §2.6/§4.2/§5.9. Build it for real this time.
- **Staff HR profile scope is now explicit** — the reduced 11-field set in the schema is final for this version; the fuller ~30-field form some early audit notes implied (marital status, English proficiency, work-type pick-lists, profile photo upload) is confirmed **out of scope**, not a pending item (§3.5.1).
- **`roleId` → nav-persona mapping is now spelled out** (§1) — this portal's frontend groups `adm` and `usr` under a single `"admin"` UI persona for sidebar/nav purposes, but they are **not** equivalent for data access: `adm` bypasses `CampaignAccessGrant` entirely, `usr` does not. Don't let a shared nav persona become a shared permission check in the actual code.

Everything else below is unchanged from v2 and still describes the target UI faithfully.

---

## 1. High-Level Architecture

**App type:** Server-rendered admin panel (jQuery/DataTables/Select2/FullCalendar style stack — pages reload on navigation; tables use client-side DataTables with Show-entries/Search/Sort/Pagination; dropdowns use Select2-style searchable comboboxes).

**This is one web app, not three.** Admin, Supervisor, and Sponsor all log in at the same screen (`POST /admin/v1/auth/login`) and land in the same shell. What differs per persona is (a) which nav items render, driven by `Role.modules`/`Role.functionality`, and (b) which data comes back from every campaign-scoped endpoint, driven by that User's `CampaignAccessGrant` rows. There is no separate "Sponsor portal" codebase — see §7.

**`roleId` → nav persona (confirmed v3, see Backend Spec v3 §2.7):**
```
adm, usr   → "admin" persona in the nav layer only — full sidebar renders for both.
             Data access still differs: adm bypasses grants entirely; usr is
             grant-scoped exactly like supervisor/sponsor. The frontend's role
             check for NAV VISIBILITY may treat adm/usr as one group; any code
             path that touches actual campaign/outlet data must still resolve
             the real roleId, never the collapsed persona string.
supervisor → "supervisor" persona (read-only, outlet-scoped)
sponsor    → "sponsor" persona (read-only, campaign-scoped)
```

**Primary entities and relationships** (matching the implemented Prisma schema — see Backend Spec v3 §2 for full field lists):

- **Client** → has many **Brands**, **Distributor Points**, **Campaigns**
- **Brand** → belongs to Client; has many **Items**
- **Campaign** → belongs to a Client; has a date range (From/To); has many **Campaign Items** (Brand+Item pairs); has many **Activations**; has many **Supervisor Tasks** (schema only — no CRUD yet, §3.7.1); has many **Campaign Access Grants**; has many **Supervisor Routes** *(new in v3 — see §3.7.4)*
- **Activation** → belongs to a Campaign; assigned to one **Outlet**, one **Promoter**, one **Supervisor**, optionally a **Distributor Point**; has a date range; has Target Type (Item Wise/Brand Wise), Target Categorization (Daily/Monthly), Target Unit (Unit Wise/Sales Wise); has many **Activation Items**; has many **Targets**. **Setting the Supervisor field has a side effect** — see §3.3.2.
- **Outlet** → belongs to a City; has geocoordinates (lat/long), contact info
- **Distributor Point** → belongs to a City and a Client
- **City** → belongs to a Province and District (fixed lookup list, Sri Lanka)
- **Staff (Promoter/Supervisor)** → a single "Staff" entity typed as Promoter or Supervisor; HR profile (personal, bank, emergency contact — the confirmed reduced set, §3.5.1); linked to a City; has a mobile app username/login; may optionally also be linked to a back-office `User` account (`Staff.linkedUserId`).
- **Supervisor Task** → belongs to a Campaign; has Category and Task Type (Range/Feedback) — backend table exists, no endpoints implemented yet; this module cannot be built against a real API until that's scheduled (§3.7.1 and §8).
- **Supervisor Route** *(new entity, v3)* → belongs to a Campaign and a Supervisor (Staff); has a planned outlet list and a date range. Backs §3.7.4.
- **Item** → belongs to a Brand; has price and reorder level
- **User (system/back-office account)** → has a Role; scoped to specific Campaigns via `CampaignAccessGrant`, each optionally narrowed to a subset of Outlets
- **CampaignAccessGrant** → join between User and Campaign; `scopeType`: **all** outlets or a **subset** (explicit outlet list). This is the entire RBAC mechanism — see §3.14 and §7.
- **Role** → has a Label, Description, assigned Modules + Functionality, and a Default URL. **Seeded roles: `adm`, `usr`, `supervisor`, `sponsor`** only — see table below.
- **Sales record** → raw per-item, per-promoter, per-outlet, per-date sales entry (Start Qty, Sold Qty, Price, Total)
- **Attendance record** → check-in/check-out per promoter/supervisor per outlet per date, with computed Work Hours. **A promoter can only have one open check-in at a time, across every campaign.** **Geofence deviation never blocks check-in** — it's surfaced as an unverified flag on the record, not a rejection (see Backend Spec v3 §5.6) — make sure the Attendance screens show this as a review flag, not an error state.
- **Tracking ping** → GPS Latitude/Longitude + Time per promoter/supervisor; foreground-only, tied to an open shift.

**Roles:**
| Id | Label | Write access | Default landing |
|---|---|---|---|
| `adm` | Super Admin | Full — bypasses campaign access checks entirely, sees every campaign | `/dashboard` |
| `usr` | Campaign Admin | Full, but still grant-scoped like Supervisor/Sponsor — only sees campaigns they hold a grant for | `/dashboard` |
| `supervisor` | Supervisor | **Read-only** — attendance, sales, live tracking for their granted campaign(s)/outlet(s) | `/portal/campaigns` |
| `sponsor` | Sponsor | **Read-only** — stats, reports, live tracking for their granted campaign(s) | `/portal/campaigns` |

The old `client` and `super` role ids from the original StaffPulse audit are **not** part of the implemented Role seed.

---

## 2. Global Navigation (Left Sidebar)

Fixed sidebar, collapsible (chevron at bottom), top header shows "Campaign Buddy" logo and "Welcome, {display name}" with a dropdown (logout, etc.).

**Campaign Switcher** in the header, next to the "Welcome" dropdown. Options populated from `GET /admin/v1/campaigns` — for `adm` this is every campaign in the system; for every other role, exactly the campaigns that User holds a `CampaignAccessGrant` for. Switching campaigns re-scopes every screen below it (Activations, Attendance, Sales, Stats, Tracking, Reports, Leave Requests, Supervisor Routes) to that campaign. Screens that are NOT campaign-scoped (Clients, Items/Brands catalog, Outlets/Cities, Users/Roles/Staff pool) stay reachable regardless of switcher state.

Sidebar sections, with which roles see them:

1. Dashboard — `adm`, `usr`
2. Clients — `adm`, `usr` (catalog, not campaign-scoped)
3. Campaigns ▾ — List, Activation — `adm`, `usr` (write); read-only variant reachable by `supervisor`/`sponsor` for their granted campaign(s) only
4. Outlets ▾ — List, Distributor Point, Cities — `adm`, `usr`
5. Staff ▾ — List, Attendance, Absence, Leave Requests, Profiles — `adm`, `usr` (write); `supervisor` sees Attendance/Absence read-only, filtered to their granted outlets
6. Sales ▾ — SKU Wise Sales, Sales Update Status, Outlet wise, Update Sales, Custom Fields *(§3.6.5)* — `adm`, `usr` (write); `supervisor`/`sponsor` see read-only, scoped
7. Supervisors ▾ — Tasks *(not buildable yet, §3.7.1)*, Outlet Attendance, Attendance, Assign Routes *(now buildable — §3.7.4)* — `adm`, `usr`
8. Items ▾ — List, Brands, Reorder — `adm`, `usr`
9. Tracking ▾ — Promoter, Supervisor — `adm`, `usr` (full); `supervisor`/`sponsor` see a **live map** view (backed by `GET /campaigns/:id/tracking/live`) scoped to their granted outlets
10. Reports ▾ — Overall SKU Wise, Overall Brand Wise — `adm`, `usr`; `sponsor` sees the same reports, same endpoints, automatically scoped to their grant (§3.11)
11. Users — `adm` only (also where Campaign Access is managed — §3.14)
12. Promoter list — `adm`, `usr`, `supervisor` (read-only variant)
13. Reports for Sponsor — same screen as item 10, not a separate section (§3.11)
14. Activation list — see item 3
15. Admin Reports ▾ — Monthly Attendance — `adm`, `usr`
16. Roles — `adm` only
17. Update sales — `adm`, `usr`

**New nav landing for `supervisor`/`sponsor`:** `/portal/campaigns` — a simplified card-based view since these roles typically only look at 1–3 campaigns. See §7.

---

## 3. Module-by-Module Detail

### 3.1 Dashboard (`/dashboard`)
**Purpose:** At-a-glance KPI summary for today/yesterday and the month.
**Elements:** a top campaign/client filter select (**redundant once the global Campaign Switcher ships — keep only one**); 4 stat tiles (Active outlets today, Sales today, Active outlets yesterday, Sales yesterday); two chart panels (date-range chart, monthly bar chart); "Monthly summary" section (Total Sales, Total Units Sold, Average Sales, plus supporting cards — verify with a wider viewport, original audit viewport cut this off).

### 3.2 Clients (`/clients/all`)
Manage client companies. Backed by `GET/POST /admin/v1/clients`, `PATCH/DELETE /admin/v1/clients/:id`.

### 3.3 Campaigns
#### 3.3.1 Campaign List (`/campaign/all`)
Backed by `GET/POST /admin/v1/campaigns`. Creating a campaign automatically grants the creating admin an `"all"`-outlet `CampaignAccessGrant`. **`status` can now also be set manually** on the edit form (Backend Spec v3 §5.8) — show it as an editable field, not a read-only badge, with a note that it auto-syncs from the date range unless overridden.

#### 3.3.2 Activation List (`/activation/all`) & Add form
When the **Supervisor** dropdown is set (create or edit), the backend auto-grants that supervisor's linked web-portal login (if any) access to this Activation's outlet — expanding an existing `"subset"` grant, or creating a new `"subset"` grant scoped to just this outlet if they didn't have one yet. **Always additive, always `"subset"` — never `"all"` by default (confirmed, Backend Spec v3 §5.3).** Show a confirmation note when this fires: *"Aruni Silva now has portal access to Nawala Retail Outlet on this campaign."* If the supervisor has no linked login: *"Aruni Silva has no portal login — grant one from Users if she needs web access."*

#### 3.3.3 Activation Targets
Unchanged.

#### 3.3.4 Campaign Access
Reached via an "Access" tab on the Campaign detail page (`GET /admin/v1/campaigns/:campaignId/access`). Shows every User currently granted access to this campaign. **Columns:** Display Name, Role, Scope (badge: "All outlets" or "N outlets" with hover/expand), Action (edit scope / revoke). **Add access:** User (searchable dropdown), Scope (radio: All / Specific outlets), Outlet multi-select (when Specific chosen), Save → `POST /admin/v1/users/:id/campaign-access`. **Revoke** → `DELETE /admin/v1/users/:id/campaign-access/:campaignId`.

### 3.4 Outlets
List, Distributor Points, Cities — map directly to catalog endpoints.

### 3.5 Staff (Promoters & Supervisors)
#### 3.5.1 Staff List & Add form — **HR field scope confirmed final, v3**
Fields: Basic Info (fullName, `displayName` — labelled **"Display Name (App Name)"**, this is the name the promoter sees in CB Mobile and the greeting, gender, dateOfBirth, nic, permanentAddress, currentAddress, `cityId` — labelled **"Home City"**: the promoter's city of residence, HR data only, *not* derived from any outlet (issue #5), phone), Emergency Contact (emergencyContactName, emergencyContactPhone), Bank Account (bankAccountName, bankName, bankAccountNumber, bankBranch). **This is the complete field set** — no profile photo upload, no marital status, no English-proficiency ratings, no work-type/designation pick-lists. If any of those turn out to be needed later, they're a schema change and a new spec revision, not an existing gap.

`phone` doubles as a **mobile-app login identifier** — CB Mobile accepts either the mobile number (any common Sri Lankan format, normalised to E.164) or the legacy app username (issue #3). Enter it in any format; it is stored canonical.
One addition kept from v2: the Staff edit form should surface whether this Staff record has a linked portal `User` and, if not, offer a "Grant portal access" action — the manual complement to §3.3.2's auto-grant.

#### 3.5.2 Staff Attendance (`/promoter/attendance`)
Visible read-only to `supervisor`, filtered to their granted outlets. A promoter who appears to have "no check-in" for a given campaign/day may actually be checked in elsewhere (global one-open-shift rule) — surface as "Checked in on {other campaign}" rather than a bare no-show. **Unverified check-ins (outside geofence) are a review flag on this screen, never a block** — the promoter's check-in always succeeds; show `checkInLocationVerified = false` rows with a visual flag, not an error.

#### 3.5.3 Staff Absence
Unchanged.

#### 3.5.4 Staff Leave Requests (`/promoter/leave`)
Campaign-scoped: `GET /admin/v1/campaigns/:campaignId/leave-requests`; approve/decline via `PATCH .../leave-requests/:id`. "Approved By" defaults to the requester's `Staff.reportsToStaffId` at submission time.

#### 3.5.5 Staff Profiles
Performance evaluation view, backed by the **new v3 endpoint** `GET /admin/v1/staff/:staffId/evaluation?dateFrom=&dateTo=` (Backend Spec v3 §4.2) — this previously had no home in any doc; it's real now. Show `overallPerformancePct`, `attendancePct`, `totalSales`, `totalItems`, `avgSalesPerMonth`, `highestDailySales`, `highestPerformingDate`, and a `brandContribution` breakdown.

#### 3.5.6 Promoter List
Read-only variant; also reachable by `supervisor`.

### 3.6 Sales
All sub-sections campaign-scoped and outlet-filtered per the caller's grant. **Update Sales** now has a real lookup endpoint backing its cascading dropdowns: `GET /admin/v1/campaigns/:campaignId/sales/lookup?staffId=&outletId=&activationId=&date=` (Backend Spec v3 §4.2) — stock corrections go through `PATCH /campaigns/:campaignId/sales/:salesRecordId`.

#### 3.6.5 Custom Sales Fields (`/sales/custom-fields`) — issue #13, `adm` write
Per-campaign definitions of extra fields promoters record on the daily sales update. Each field has a label, an "applies to" scope (**Whole day** → one value per promoter/day, or **Each product** → one value per SKU/day), a type (Number / Text / Yes-No / Dropdown, with an options list for Dropdown), a Required flag and a sort order. Type and scope are frozen once the field has recorded values; a used field is archived (soft-delete) rather than deleted. Backed by `GET/POST/PATCH/DELETE /admin/v1/campaigns/:campaignId/sales-fields`. On the Update Sales / Sales page, day fields render above the product grid and product fields as extra columns, saved via `PUT /admin/v1/campaigns/:campaignId/sales/custom-values`; day values also show in the "Last 7 Days" panel and CSV export.

### 3.7 Supervisors
#### 3.7.1 Supervisor Tasks (`/supervisor/all`) — still blocked
Fields as originally audited are still the intended design, but the backend has no endpoints for `SupervisorTask` yet — only the table exists. Treat as a placeholder/mock in any interim build.

#### 3.7.2 Outlet Attendance
Naturally outlet-filtered for `supervisor` via `CampaignAccessGrant`.

#### 3.7.3 Supervisor Attendance
Unchanged.

#### 3.7.4 Assign Routes — **NO LONGER BLOCKED, build this pass**
Now backed by the `SupervisorRoute` model and campaign-scoped endpoints (Backend Spec v3 §2.6, §4.2, §5.9):
```
GET  /admin/v1/campaigns/:campaignId/supervisor-routes?supervisorId=&outletId=&dateFrom=&dateTo=
POST /admin/v1/campaigns/:campaignId/supervisor-routes   body: { supervisorStaffId, outletIds: [...], dateFrom, dateTo }
PATCH  /admin/v1/campaigns/:campaignId/supervisor-routes/:id
DELETE /admin/v1/campaigns/:campaignId/supervisor-routes/:id
```
Form: Supervisor (searchable dropdown, Staff where `userType = supervisor`), Outlets (multi-select — only outlets that already have an Activation on this campaign), Date From/To. List columns: Supervisor, Outlets (count + expand), Date range, Actions (edit/delete). This is planning data only — it doesn't drive attendance or check-in.

### 3.8 Items
Unchanged.

### 3.9 Tracking
#### 3.9.1 Promoter Tracking (`/promoter/tracking`)
Unchanged for `adm`/`usr` — raw coordinate table.
**Live map for `supervisor`/`sponsor`**, backed by `GET /admin/v1/campaigns/:campaignId/tracking/live` — current position of every checked-in staff member, outlet-filtered by grant. **Confirmed campaign-scoped** (Backend Spec v3 §4.2) — a different endpoint from the historical breadcrumb table, which still doesn't have a dedicated admin endpoint (§6).

#### 3.9.2 Supervisor Tracking
Unchanged.

### 3.10 Reports (Agency/Super-Admin scope)
Both map to `GET /admin/v1/campaigns/:campaignId/reports/sku-wise` and `/reports/brand-wise`.

### 3.11 Client / Sponsor Reports — confirmed, no separate routes
There's only one set of report endpoints. The "client-scoped" behavior comes entirely from the `sponsor` role's `CampaignAccessGrant` filtering the same endpoint — **there is no `sku-wise-client` or `brand-wise-client` route, confirmed final (Backend Spec v3 §5.10).** A Sponsor logging in sees the identical screen, pre-filtered to their granted campaign(s), no separate outlet filter needed unless their own grant happens to be outlet-scoped (rare for sponsors, but not schema-prevented).

### 3.12 Activation List (Sponsor-scoped variant)
Same underlying endpoint as the Admin's Activation List — read-only for `sponsor`, pre-filtered to their switcher-selected campaign. No separate route/page.

### 3.13 Admin Reports → Monthly Attendance
Unchanged.

### 3.14 Users (`/sys/users`)
Back-office account management. Backed by `GET/POST /admin/v1/users`, `PATCH /admin/v1/users/:id` (admin-only).
**List columns:** Display name, Email, Username, User role, Created at, Updated at, Is active, Actions.
**Add form:** Username *, Password *, Display name *, Email, User role * (Super Admin / Campaign Admin / Supervisor / Sponsor), Is active *, Save / Save & go back / Cancel.
**No Campaigns/Distributors/Brands multi-select** — campaign access is granted separately, per campaign, from either the User's own "Campaign Access" tab or automatically via §3.3.2's auto-grant.

### 3.15 Roles (`/sys/roles`)
Form fields unchanged: Id, Label, Description, Modules, Functionality, Default url, Is active. **List shows exactly the four implemented roles** (§1's table). `supervisor` and `sponsor`'s `functionality` sets should be configured view-only — enforced server-side regardless via `requireRole("adm","usr")`, so this screen is documentation/consistency only, not the enforcement mechanism.

---

## 4. Cross-Cutting UI Patterns

*(items 1–10 unchanged — list-page shell, Excel export, filter-bar pattern, cascading dropdowns, builder sub-forms, status badges, required-field asterisks, dual grid widgets, geolocation capture, image/avatar handling)*

**11. Grant-scoped empty states.** Any screen a Supervisor or Sponsor can reach should handle the case where their `CampaignAccessGrant.outletIds` subset excludes every outlet with current data — show "No activity in your assigned outlets for this range" rather than a bare empty table.

**12. Additive-access confirmation toast.** Any action that triggers the §3.3.2 auto-grant should surface a brief, dismissible confirmation rather than silently changing another user's access.

**13. Geofence-unverified flag, never an error state.** Any attendance table showing `checkInLocationVerified = false` should render it as a neutral/warning flag ("Location unverified") for review, not as a failed or rejected state — check-in always succeeded.

---

## 5. Suggested Entity List for Rebuild's Data Model

Client, Brand, Item, Campaign, CampaignItem (join), Activation, ActivationItem (join), ActivationTarget, Outlet, DistributorPoint, City (with Province/District), Staff (Promoter/Supervisor, one table with type flag + the confirmed reduced HR field set + optional `linkedUserId`), SupervisorTask *(schema only, no endpoints)*, **SupervisorRoute** *(new in v3 — Staff × Campaign × outlet list × date range)*, AttendanceRecord, LeaveRequest, SalesRecord, DailyStats, SalesSummary, TrackingPing, User (back-office, `roleId`), Role (`adm`/`usr`/`supervisor`/`sponsor`), CampaignAccessGrant.

This list tracks `CampaignBuddy_Backend_Spec_v3.md` §2 exactly — that document is the authoritative field-level source; this section is a summary for portal-design purposes only.

---

## 6. Known Gaps / Things to Verify Before Rebuild

- Several report pages ("Outlet wise" sales, "Reorder") didn't fully render data in the original audited account — re-verify exact output columns with populated data.
- Dashboard's rightmost "Monthly summary" tiles were cut off in the original audit viewport.
- "Total Units Sold" showing an "Rs." currency prefix in the original app is a labeling bug — don't carry over.
- Activation Target's "Repeat" recurrence options and Target Type dropdown values should be confirmed against an existing target's edit view.
- **Supervisor Tasks module (§3.7.1) has no backend endpoints** — cannot be built against a real API yet.
- **No historical Tracking table endpoint** — only the live snapshot exists; a full breadcrumb-history view would need a new endpoint (not built this pass).
- **No Distributor- or Brand-level access scoping** — campaign/outlet only, by design.
- Staff password reset and User portal refresh-token flow remain backend stubs — any "Forgot password" UI on this portal's login screen currently hits a no-op.
- ~~No Assign Routes backend entity~~ — **resolved in v3**, see §3.7.4.

---

## 7. Sponsor & Supervisor Portal — how it differs from the Admin experience

Since Sponsor and Supervisor share the same codebase and API as Admin, the "portal" for these two roles is:
- **Login:** same screen, same endpoint (`POST /admin/v1/auth/login`).
- **Landing page:** `/portal/campaigns` instead of `/dashboard` — card-based view of just their granted campaigns.
- **Campaign Switcher:** identical mechanism to Admin's, shorter list.
- **Every screen is either fully hidden** (write-only modules) **or rendered read-only** (Activations, Attendance, Sales, Stats, Live Tracking, Reports, Leave Requests) — conditional rendering plus server-side 403 on any write attempt.
- **Supervisor-specific:** may see a narrower outlet set within a campaign than a Sponsor would — the UI should surface "N of M outlets" rather than making it look like the campaign only has N outlets.
- **Sponsor-specific:** typically campaign-wide (`scopeType: "all"`), Reports/Stats/Live-Tracking are the screens worth polishing most.
