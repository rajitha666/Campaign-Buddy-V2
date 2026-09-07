# Campaign Buddy — Product Documentation

**Version:** v3 (feature-complete build, 2026-09-06)
**Scope of this document:** every feature implemented in the two shipping products —
**CB Office** (the web portal for head office, supervisors and sponsors) and
**CB Mobile** (the field-rep app) — described in plain language, organised so it can
be re-cut into marketing/sales material, sales-staff training, and supervisor/sponsor
portal guides.

Internal code names: CB Office = `campaign-buddy-portal`, CB Mobile = `campaign-buddy-app`,
both served by one backend (`campaign-buddy-backend`).

---

## 1. What Campaign Buddy is

Campaign Buddy is a field-marketing execution platform for agencies that run
**in-store product activations** — a promoter stationed in a supermarket or retail
outlet for the duration of a campaign, selling a client's products, tracking stock,
counting footfall, and reporting sales every day.

It replaces the usual mix of WhatsApp photos, paper stock sheets and end-of-week
spreadsheets with:

- a **mobile app** every promoter and field supervisor uses on their shift, and
- a **web portal** where the agency sets up campaigns, and where the agency's
  clients ("sponsors") and field supervisors log in to watch their campaigns live.

One backend serves both. There is **one codebase for the web portal** — Admin,
Supervisor and Sponsor all log in at the same screen and see a version of the same
app shaped by their role and the campaigns they've been granted access to.

### The three audiences

| Audience | Product | Typical user | What they do |
|---|---|---|---|
| **Head office / agency ops** | CB Office | Campaign manager, admin | Set up clients, catalogs, campaigns, outlets, staff; assign promoters; correct data; run reports |
| **Field supervisor** | CB Office (read-only) + CB Mobile | Person who drives between 5–20 outlets checking on promoters | Watch attendance & live location for their outlets; review sales; plan outlet visit routes; (on mobile) check in at outlets they visit |
| **Sponsor / client** | CB Office (read-only) | Brand manager at the client company | Watch their campaign's sales, footfall and live promoter locations; pull SKU / brand reports |
| **Promoter** | CB Mobile | In-store product promoter | Check in on shift, update stock & sales through the day, log footfall, confirm the daily sales summary, check out, request time off |

---

## 2. Core concepts (the domain model in plain English)

Everything in Campaign Buddy hangs off these entities. Understanding this list makes
every screen self-explanatory.

- **Client** — the brand owner who commissions a campaign (e.g. "Prisha Naturals").
  Has **Brands**, and **Campaigns**.
- **Brand** — a brand belonging to a client (e.g. "Sulfate-Free Shampoo Range").
  Has **Items**.
- **Item** — a single sellable product (SKU): name, SKU code, unit price in whole
  LKR, re-order level, optional image. The item catalog is **client-wide**, not
  campaign-specific — an item is defined once and reused across campaigns.
- **City / Outlet / Distributor Point** — geography.
  - **Outlet** = a retail location where a promoter is stationed. Has GPS
    coordinates and a **geofence radius** (default 150 m) used to verify check-ins.
  - **Distributor Point** = a restock/supply point, optional on an activation.
- **Campaign** — a client's activation programme: a name, a campaign number, a
  **start and end date**, a timezone (default Asia/Colombo), and a **status**
  (`upcoming` / `active` / `ended`). Has:
  - **Campaign Items** — which items from the catalog are sellable *anywhere* in
    this campaign.
  - **Activations** — the individual promoter postings.
  - **Access Grants** — which portal users (supervisors, sponsors, campaign admins)
    can see this campaign.
  - **Supervisor Routes** — planned outlet-visit schedules for supervisors.
  - **Supervisor Tasks** — a QA checklist template for outlet visits.
- **Activation** — the heart of the model: **one promoter, at one outlet, for one
  campaign, over one date range.** Also carries:
  - an optional **named field supervisor**,
  - an optional **distributor point**,
  - a **planned shift window** (shift start / end) used for late/on-time
    calculation,
  - **target settings**: Target Type (Item-wise / Brand-wise), Target
    Categorization (Daily / Monthly), Target Unit (Unit-wise / Sales-wise),
  - **Activation Items** — the subset of the campaign's items actually sold at
    *this* outlet,
  - **Activation Targets** — numeric targets per item over a date range.
- **Staff** — a promoter or a field supervisor. One table, typed
  `promoter` or `supervisor`. Has a mobile login (username + password), an
  employee ID, an HR profile (personal details, emergency contact, bank account),
  a home city, a "reports to" person for leave approval, and — for supervisors —
  an **optional linked portal login** so the same person can also log into CB
  Office.
- **User** — a back-office / portal login. Has a **Role** (`adm`, `usr`,
  `supervisor`, `sponsor`) and a set of **Campaign Access Grants**.
- **Campaign Access Grant** — the entire access-control mechanism: it ties a User
  to a Campaign, either for **all outlets** or a **specific subset of outlets**.

### Daily operational data (generated by CB Mobile)

- **Attendance Record** — one per activation per day: check-in time + GPS,
  location-verified flag, check-out time + GPS, whether the sales summary was
  confirmed at checkout, and a status (`on_time` / `late` / `leave` / `absent` /
  `pending`).
- **Sales Record** — one per item per activation per day: opening stock, sold
  today, "other interested customers" count, re-order flag. Remaining stock is
  always **opening − sold**, never stored.
- **Daily Stats** — one per activation per day: footfall, approached, converted.
- **Sales Summary** — the promoter's end-of-day confirmation (remarks + confirmed
  flag). All the totals on it are computed live, never stored.
- **Tracking Ping** — a GPS position logged every ~60 s while a promoter is
  checked in and has the app open.
- **Leave Request** — a time-off request from the mobile app (from/to dates,
  reason, note, status, approver).

---

## 3. Roles and the access model

### Portal roles (CB Office)

| Role | Code | Write access | Sees | Lands on |
|---|---|---|---|---|
| **Super Admin** | `adm` | Everything | **Every campaign in the system** (bypasses access grants entirely) | Dashboard |
| **Campaign Admin** | `usr` | Everything | Only campaigns they hold a grant for | Dashboard |
| **Supervisor** | `supervisor` | **Read-only** | Their granted campaign(s), often narrowed to a subset of outlets | Campaigns card view |
| **Sponsor** | `sponsor` | **Read-only** | Their granted campaign(s), usually all outlets | Campaigns card view |

Read-only is enforced on the server — a supervisor or sponsor token is rejected on
every write endpoint regardless of what the UI shows.

### How access is scoped

A portal user sees a **campaign switcher** in the header. It lists exactly the
campaigns they have access to (for Super Admin: all of them). Switching campaigns
re-scopes every campaign-bound screen — activations, attendance, sales, stats,
tracking, reports, leave requests, routes.

Non-campaign screens (the client/item catalog, outlets, cities, the staff pool,
users, roles) are always reachable for admins regardless of the switcher.

Within a campaign, a grant can be **all outlets** or a **named subset**. A
supervisor scoped to 3 of a campaign's 12 outlets sees only those 3 outlets' data
everywhere, and the UI is expected to say "3 of 12 outlets" rather than making the
campaign look smaller than it is.

### The supervisor auto-grant (important, and a selling point)

When an admin assigns a **named field supervisor** to an activation, and that
supervisor has a linked portal login, Campaign Buddy **automatically gives that
supervisor portal access to that outlet on that campaign**:

- No existing grant → creates one scoped to just that outlet.
- Existing outlet-subset grant → adds the outlet to it.
- Existing all-outlets grant → left alone.

It only ever **widens** access, never removes it. The portal shows a confirmation
("Aruni Silva now has portal access to Nawala Retail Outlet on this campaign").
If the supervisor has no portal login yet, the portal prompts the admin to create
one.

### Mobile roles (CB Mobile)

Staff log in as either a **promoter** or a **supervisor**. The app experience is
the same; the label on the profile screen and the reporting bucket differ. A field
supervisor uses CB Mobile to check in at outlets they physically visit (the same
check-in flow as a promoter).

---

## 4. CB Office — feature by feature

The portal is a left-sidebar web app. Below, each module is described with its
purpose, what's on the screen, and which roles see it.

### 4.1 Dashboard  *(Admin only)*

At-a-glance KPIs for the selected campaign, composed live from the underlying data:

- Stat tiles: **active outlets today**, **sales today**, **active outlets
  yesterday**, **sales yesterday**.
- A **month-to-date summary**: total sales, total units sold, average sales.
- Top items by sales for the campaign.

Sponsors get a **parallel Sponsor Dashboard**: today's outlet count, total sales
and footfall, top products, plus an embedded **live promoter map**.

### 4.2 Clients & Catalog  *(Admin only)*

- **Clients** — CRUD for client companies (company name, contact name, phone,
  email, address).
- **Items → List** — CRUD for the SKU catalog: item name, brand, description, unit
  price (LKR), re-order level, image. Shared across all campaigns.
- **Items → Brands** — CRUD for brands, each owned by a client.
- **Items → Reorder** — a live list of items at or below their re-order level per
  outlet for a chosen date (fed by the re-order flags promoters raise on mobile).

### 4.3 Campaigns  *(Admin write; Supervisor/Sponsor read-only view)*

- **Campaigns → List** — CRUD for campaigns: campaign number, name, client,
  description, date range. Creating a campaign automatically grants the creator
  full access to it. **Status is an editable field** — it auto-syncs from the date
  range, but an admin can override it (e.g. end a campaign early) and the override
  sticks until the dates themselves change.
- **Campaign Items** (per campaign) — pick which catalog items are sellable in this
  campaign. Add an existing item, or create-and-link a brand-new item in one step.
- **Campaigns → Activation (Activation List)** — CRUD for activations. The add/edit
  form captures outlet, promoter, supervisor, distributor point, date range, and
  the three target settings. **Setting the supervisor here fires the auto-grant**
  (§3). Each activation row links through to:
  - **Activation Items** — tick which of the campaign's items this specific outlet
    stocks; "add all" shortcut; idempotent so a reload never double-adds.
  - **Activation Targets** — numeric targets per item over a date range, with an
    optional repeat flag.
- **Campaign Access** (per campaign) — lists every portal user with a grant on this
  campaign, their role, and their outlet scope ("All outlets" / "N outlets").
  Add access (user + scope + outlet multi-select), edit scope, or revoke.

Sponsors see a read-only **Activation List** filtered to their campaign; supervisors
see a read-only **My Campaigns** card view.

### 4.4 Outlets  *(Admin only)*

- **Outlets → List** — CRUD: name, contact person, address, city, phone/mobile/fax,
  and **GPS coordinates** (with a geocode helper). The coordinates + geofence
  radius drive mobile check-in verification.
- **Outlets → Distributor Point** — CRUD for supply points (name, contact, address,
  city, client).
- **Outlets → Cities** — CRUD for the city lookup (name, province, district — Sri
  Lanka list).

### 4.5 Staff (People)  *(Admin write; Supervisor read-only on some screens)*

- **Staff → List** — CRUD for promoters and supervisors. The form is grouped:
  - **Basic Info**: employee ID, full name, display name (shown in the app), user
    type (promoter/supervisor), status (active/inactive), gender, date of birth,
    NIC, mobile, city, permanent & current address.
  - **Login**: mobile app username, password (set on create; leave blank on edit
    to keep).
  - **Emergency Contact**: name, phone.
  - **Bank Account**: account name, bank, account number, branch.
  - This 11-field HR set is the **final, deliberate scope** — no photo upload, no
    marital status, no proficiency ratings.
- **Staff → Attendance** — check-in / check-out log for promoters, filterable by
  outlet and date range, with **on-time / late / status** badges. Supervisors see
  this read-only, filtered to their outlets. A promoter who looks absent here may
  actually be checked in on another campaign (see the one-open-shift rule, §6) —
  the screen is meant to surface that rather than show a bare no-show.
- **Staff → Absence** — for a chosen date, the promoters who had an activation
  covering that day but **no check-in**, flagged "On leave" vs "No check-in".
- **Staff → Leave Requests** — time-off requests submitted from CB Mobile, per
  campaign. Approve / decline inline. "Approved by" defaults to the requester's
  "reports to" person.
- **Staff → Profiles** — a **performance evaluation** view for a selected staff
  member over a date range: overall performance %, attendance %, total sales, total
  items, average sales per month, highest daily sales, highest-performing date, and
  a brand-contribution breakdown.
- **Promoter List** — a read-only staff directory (also visible to supervisors).

### 4.6 Sales  *(Admin write; Supervisor/Sponsor read-only, scoped)*

- **Sales → SKU Wise Sales** — the raw per-item, per-promoter, per-day sales log:
  item, outlet, date, start qty, sold qty, remaining. Filter by outlet and date
  range.
- **Sales → Sales Update Status** — daily submission compliance: for a chosen date,
  which activations have submitted their stats/sales ("Completed") and which
  haven't ("Missing"), with footfall.
- **Sales → Outlet Wise** — sales + footfall rolled up per outlet, with a
  daily/weekly/monthly duration toggle.
- **Update Sales** *(Admin)* — the correction tool. Cascading dropdowns (outlet →
  promoter → activation → date) load that day's sales grid; the admin edits opening
  stock / sold qty for any row and saves. This is how head office fixes a
  promoter's mistake without touching the app. Raising opening stock mid-day is
  allowed (mid-day restock).
- Sponsors get a dedicated **Sales & Foot Fall** view; supervisors get the SKU-wise
  view scoped to their outlets.

### 4.7 Supervisors  *(Admin only)*

- **Supervisors → Assign Routes** — plan a supervisor's outlet visits: pick a
  supervisor, a set of outlets (only outlets that already have an activation on
  this campaign), and a date range. A month calendar shows the planned routes.
  This is **planning data only** — it doesn't drive check-in or attendance.
- **Supervisors → Outlet Attendance** — the supervisor visit log: attendance rows
  for activations whose assigned staff is a supervisor, so head office can see
  which outlets a supervisor actually visited and when.
- **Supervisors → Attendance** — supervisors' own check-in log.
- **Supervisors → Tasks** — a QA checklist template per campaign (category + task
  type Range/Feedback + the question text). Categories include Sale, Outlet PR,
  Documentation, Discipline, Competitor Activities, Communication, Capability,
  Attitude, Attire & Grooming. *(The template is configurable in the portal; the
  mobile app does not yet consume it — see §7.)*

### 4.8 Tracking  *(Admin full; Supervisor/Sponsor get the live map)*

- **Tracking → Promoter** / **Tracking → Supervisor** — the GPS breadcrumb trail
  (coordinate + timestamp) for a chosen person on a chosen date, split by staff
  type.
- **Tracking → Seller Live Locations** — a **live map** of every currently
  checked-in staff member's latest position, auto-refreshing every ~15 s,
  outlet-filtered by the viewer's grant. This is the screen sponsors and
  supervisors care about most.

### 4.9 Reports  *(Admin; Sponsor sees the same, auto-scoped)*

- **Reports → Overall SKU Wise** — sales aggregated by item across the campaign:
  item, brand, item count, total sales, plus a grand total. Filter by date range.
- **Reports → Overall Brand Wise** — the same, aggregated by brand.
- **Client Reports / Statistic Reports** — the *same* SKU-wise and brand-wise
  endpoints, presented for sponsors and automatically filtered to their grant.
  There is deliberately no separate "client report" data path.
- **Admin Reports → Monthly Attendance** — a per-promoter day grid for a chosen
  month: a tick / A (absent) / L (leave) / · per day, exportable to CSV.

### 4.10 Administration  *(Super Admin only)*

- **Users** — CRUD for portal logins: username, password, display name, email,
  role, active flag. Campaign access is *not* set here — it's granted per campaign
  from the Campaign Access screen or automatically via the supervisor auto-grant.
- **Roles** — view/configure the four roles: id, label, description, modules,
  functionality, default landing URL, active flag. This screen is for consistency
  and documentation; the actual read-only enforcement is server-side.

### 4.11 Cross-cutting portal behaviour

- **Campaign switcher** re-scopes everything campaign-bound in one click.
- **Excel/CSV export** on the log and report tables.
- **Grant-scoped empty states** — "No activity in your assigned outlets for this
  range" rather than a blank table, for supervisors/sponsors whose outlet subset
  has no data.
- **Geofence-unverified is a neutral review flag on attendance tables, never an
  error** — the check-in always succeeded.
- **Additive-access confirmation toast** whenever the supervisor auto-grant fires.
- **List pages**: search, sort, show-N-entries, pagination; every `/admin` list
  endpoint takes `?page`, `?pageSize`, `?search`.

---

## 5. CB Mobile — feature by feature (and the promoter's day)

CB Mobile has **four bottom tabs** — Home, Sales, Attendance, Performance — plus
three screens reached by tapping through: Campaign Products, Time Off, Profile.

### 5.1 Sign in

- Username + password (the mobile username set on the Staff record).
- **Forgot password** screen — submits the username and shows a generic
  confirmation (no account enumeration). *Delivery of the reset itself is not yet
  wired — see §7.*
- The session persists (secure device storage) and **auto-refreshes the access
  token** in the background, so a promoter isn't kicked out mid-shift.

### 5.2 Home tab

The promoter's landing screen:

- **Today's assignment** — campaign name, outlet name/address, planned shift
  window, pulled from the activation that covers today.
- **Check-in status** — whether they're on shift and since when.
- **Today's stats card** (expandable) — footfall / approached / converted, with a
  live conversion rate; tap through to update.
- **Campaign products** row — opens the product list.
- Tapping the **avatar** opens Profile.

### 5.3 Attendance tab — check in / check out

The core daily workflow.

**Check in:**
1. Promoter taps **Check in**.
2. The app requests location permission and takes a GPS fix.
3. It posts the check-in with coordinates + timestamp.
4. The backend:
   - compares the GPS fix to the outlet's location against its geofence radius and
     sets a **location-verified** flag (true/false) — **it never blocks the
     check-in**;
   - marks the check-in **on-time** or **late** against the planned shift start
     plus a **10-minute grace period**;
   - enforces the **one-open-shift lock** — if this promoter already has an open
     shift anywhere (this or another campaign), the check-in is refused with a
     clear message.
5. A live "on shift for 2h 15m" ticker runs on the screen.

**While checked in:** the app sends a **GPS ping about every 60 seconds**, but
**only while the app is in the foreground**. Backgrounding the app pauses pings
(without ending the shift); returning to foreground sends one immediately and
resumes. Pings never fire outside a check-in/check-out window. A ping that hasn't
moved >10 m since the last is skipped, though the 60 s heartbeat still fires.

**Check out:** tapping **Check out** opens a confirmation sheet — *"Did you confirm
the sales summary for today?"*
- **Yes, check out** → takes a GPS fix and checks out, recording that the summary
  was confirmed.
- **No, confirm sales summary** → sends the promoter to the Sales tab to review and
  confirm first; it does **not** check them out silently.

**Attendance history** — the current week's check-in/check-out rows with status,
right on the tab.

### 5.4 Campaign Products & stock updates

- **Product list** (Home → Campaign products) — every item this outlet stocks:
  thumbnail, name, opening stock, sold today, remaining, re-order flag. Search box;
  a **"re-order only"** toggle to filter to items needing restock.
- Tapping a product opens the **Product Update** screen:
  - **Opening stock** stepper (raise it for a mid-day restock),
  - **Sold today** stepper (the backend enforces sold ≤ opening stock),
  - **Other interested customers** stepper (demand the promoter couldn't fill),
  - **Re-order** toggle,
  - a live **remaining** readout,
  - a **product details** sheet (SKU, price, description, when it was added to the
    campaign).
  - Saving updates stock and, because `sold today × unit price` feeds the
    server-computed sales total, the Home and Performance figures update too.

### 5.5 Sales tab — the daily sales summary

- **Total sales today** (computed: Σ sold × unit price across the outlet's items).
- **Items received / sold / remaining** roll-up.
- **Footfall / approached / converted** with conversion %.
- A **remarks** field for notes about the day.
- **Confirm & submit** — locks in the day's summary. This is the action the
  checkout flow asks the promoter to complete. It's idempotent — re-confirming is
  safe.

### 5.6 Stats update

Reached from Home. Three steppers — **footfall**, **approached**, **converted** —
sent as absolute values (not deltas). Live conversion-rate readout. Feeds the
Sales summary and the portal's stats/footfall reporting.

### 5.7 Performance tab

The promoter's own scoreboard for the campaign:

- Campaign name, start date, **"Day 12 of 30"** progress.
- Totals: total sales, units sold, approached.
- A **bar chart of daily sales** across the campaign so far.
- **Top products** by units sold.

### 5.8 Time Off

Reached from the Attendance tab.

- **Balance card** — pending requests count, taken this year.
- **Your requests** — each with reason, date range, and a status chip (Awaiting
  approval / Approved / Declined).
- **Request time off** sheet — reason (sick / annual / personal / other),
  from-date and to-date pickers, an optional note for the approver. The backend
  rejects a request that **overlaps an existing pending or approved** one.
- Approvals happen in CB Office (§4.5); the decision shows back up here.

### 5.9 Profile

Avatar with initials, name, role label ("Field Promoter"), employee ID, phone,
"reports to". **Log out** button.

### 5.10 What CB Mobile deliberately does not do

Reads are cached and refetched on change (TanStack Query). There is no offline
write queue — the promoter needs a connection to check in, save stock, and confirm.
Location pings are foreground-only by design (battery + privacy).

---

## 6. Business rules that matter (cross-cutting)

These are the rules a marketing/sales or training writer needs to state correctly.

| Rule | What it means |
|---|---|
| **Geofence is a soft flag** | Check-in is **never blocked** by location. If the GPS fix is outside the outlet's radius, the record is marked "location unverified" for review. Radius defaults to 150 m per outlet. |
| **10-minute grace period** | Check-in is "on time" if within 10 minutes of the planned shift start, "late" after. Fixed for now, not yet configurable. |
| **One open shift at a time** | A promoter can be *assigned* to concurrent activations across campaigns, but can only be *checked in* to one at a time — anywhere. Prevents double-claiming shifts. |
| **Supervisor auto-grant** | Naming a supervisor on an activation gives their portal login access to that outlet automatically. Always additive, always outlet-scoped, never "all outlets" by default. |
| **Campaign status auto-syncs, manual override sticks** | Status is derived from the date range, but an admin override (e.g. ending early) is respected until the dates change. |
| **Totals are always computed, never stored** | Sales totals, summary roll-ups and remaining stock are calculated on read from the raw counters. No stale cached numbers. |
| **Mid-day restock edits opening stock** | There's never a second stock row for the same item/day — you raise `opening stock` in place, on mobile or via the portal's Update Sales. |
| **Location pings: foreground + checked-in only** | ~60 s heartbeat, paused on background, stopped on check-out, never before a shift. |
| **Read-only roles are enforced server-side** | Supervisor and Sponsor tokens are rejected on every write, regardless of the UI. |

---

## 7. Not in this version (deferred, by decision)

- **Supervisor Tasks on mobile** — the QA checklist template is configurable in CB
  Office, but the mobile app doesn't present it to supervisors yet.
- **Password-reset delivery** — the "forgot password" screen and endpoint exist,
  but no email/SMS is actually sent.
- **Portal session refresh** — CB Office users re-login when their session expires
  (CB Mobile does refresh silently).
- **Configurable geofence radius / grace period** — radius is a per-outlet default,
  grace period is a fixed 10 minutes.
- **Historical location breadcrumb in the portal beyond the raw table** — the live
  map is a current-position snapshot; there's a coordinate trail table but no
  route-replay view.
- **Access scoping below campaign/outlet** — no brand- or distributor-level
  scoping.
- **Fuller HR profile / staff photos** — the 11-field HR set is final for v3.
- **Offline writes on mobile** — a connection is required for check-in, stock
  saves and confirmation.

---

## 8. Suggested persona journeys (for training / sales narratives)

### 8.1 Head-office setup (Campaign Admin), one-time per campaign

1. Create the **Client** (if new) and its **Brands** and **Items**.
2. Create **Cities** and **Outlets** (with GPS) if new.
3. Create the **Campaign** with its date range.
4. Add **Campaign Items** — the products in scope.
5. Create **Staff** records for promoters and supervisors (with mobile logins).
6. Create **Activations** — one per promoter per outlet, setting the supervisor
   (which auto-grants their portal access), shift window, and targets.
7. Per activation, set **Activation Items** and **Activation Targets**.
8. Optionally grant **Sponsor** users access to the campaign.
9. Optionally plan **Supervisor Routes**.

### 8.2 A promoter's shift (CB Mobile)

1. Arrive at the outlet, open the app, **check in** (grants location, GPS fix).
2. Through the day: update **stock and sales** per product as items sell; raise the
   **re-order** flag when low; bump **footfall / approached / converted**.
3. Near end of shift: open the **Sales** tab, review the day's numbers, add
   **remarks**, **confirm & submit**.
4. **Check out** (confirms the summary was done, takes a final GPS fix).
5. If needed, submit a **time-off request** for a future date.

### 8.3 A field supervisor's day

- **Before / during:** in CB Office, check the **live map** and **attendance** for
  their outlets; review **absence** and **sales update status**; check planned
  **routes**.
- **On the road:** use **CB Mobile** to check in at each outlet visited (same flow
  as a promoter) — this populates the **Outlet Attendance** / supervisor tracking
  logs head office reviews.
- **Escalations:** flag missing submissions or absent promoters to head office
  (who can correct data via **Update Sales** and approve/deny **leave**).

### 8.4 A sponsor checking in on their campaign

1. Log in, land on the **campaigns card view**, pick the campaign.
2. **Sponsor Dashboard** — today's sales, footfall, active outlets, top products,
   live map.
3. **Seller Live Locations** — watch promoters in real time.
4. **Reports → SKU Wise / Brand Wise** — pull sales by product or brand for any
   date range, export to Excel.
5. **Sales & Foot Fall** and the read-only **Activation List** for detail.

Everything a sponsor sees is automatically limited to the campaign(s) they've been
granted — no configuration on their side.

---

## 9. Appendix — reference

### 9.1 Demo / seed credentials (local build)

| Surface | Username | Password | Role |
|---|---|---|---|
| CB Office | `admin` | `ChangeMe123!` | Super Admin |
| CB Mobile | `sktest` | `Field123!` | Promoter |

Seed data includes one client (Prisha Naturals), one brand, one item, one city, one
outlet, one campaign, and one activation linking `sktest` to it.

### 9.2 Technology

- **Backend:** Node.js, TypeScript, Express, PostgreSQL, Prisma ORM. JWT auth with
  two independent token spaces (mobile staff vs portal users). Runtime request
  validation (zod). Automated test suite (backend integration + portal + mobile
  unit tests).
- **CB Office:** React + Vite single-page app.
- **CB Mobile:** React Native (Expo SDK 51), React Navigation, TanStack Query.

### 9.3 API surface (for reference when writing integration docs)

- **Mobile** (`/v1/*`): auth (login/refresh/forgot-password/logout), `me` +
  today's assignment, attendance (today/check-in/check-out/history),
  location ping, stats (today, patch), campaign products + product detail + stock
  patch, sales summary (today/patch/confirm), time-off (balance/requests),
  campaign performance.
- **Portal** (`/admin/v1/*`): auth; catalog CRUD (clients, brands, items, cities,
  outlets, distributor points); staff pool + evaluation; campaigns + campaign
  items + access; activations + activation items + targets; operations
  (attendance, sales, sales lookup, stats, live tracking, tracking history,
  leave requests, supervisor routes, supervisor tasks, absence, outlet
  attendance); reports (sku-wise, brand-wise, reorder, outlet-wise,
  attendance-monthly); RBAC administration (users, campaign access, roles).

---

*End of product documentation. Take this file to a new chat to split into
marketing/sales material, promoter training with day-to-day workflow, and the
supervisor / sponsor portal guides.*
