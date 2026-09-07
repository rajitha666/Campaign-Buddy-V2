# Campaign Buddy — v3 Consolidation Changelog & Decision Log

**Purpose:** Before this pass, Campaign Buddy had two backend specs (`Backend_Spec_v2` and `Full_Backend_Contract`) that described different systems on several fundamentals, plus an admin panel spec and two working prototypes that had each independently drifted from one or both. This document records every conflict found during the consistency review, the decision made for each, who/what confirmed it, and what changed as a result. Treat this as the permanent record — the resolved outcomes themselves live inline in `CampaignBuddy_Backend_Spec_v3.md` and `CampaignBuddy_AdminPanel_Feature_Specification_v3.md`; this file is *why*, not *what*.

---

## File status after this pass

| File | Status |
|---|---|
| `CampaignBuddy_schema_v3.prisma` | **Current — canonical.** Supersedes `CampaignBuddy_schema.prisma`. |
| `CampaignBuddy_Backend_Spec_v3.md` | **Current — canonical.** Supersedes `CampaignBuddy_Backend_Spec_v2.md` in full. |
| `CampaignBuddy_AdminPanel_Feature_Specification_v3.md` | **Current — canonical.** Supersedes `CampaignBuddy_AdminPanel_Feature_Specification_v2.md` in full. |
| `CampaignBuddy_Full_Backend_Contract.md` | **Retired.** Kept only as historical context for *why* certain decisions were made (its decision log in the original §10 is genuinely useful reading) — not to be built against. Its PHP/MySQL stack was never implemented; several of its business-rule decisions did not match what was actually built and do not carry forward (see below). |
| `CampaignBuddy__Mobile_API_Spec.md` (v1.0 draft) | **Retired.** Naming fully replaced by v2/v3 (`Staff`, `Activation`, `Item`, `SalesRecord`, `ActivationItem`). No content from it carries forward that isn't already in Spec v3. |
| `campaign-buddy-portal_Prototype.html` / `CampaignBuddy_Mobile_Prototype_v2.html` | **Not regenerated this pass.** Two known drift points flagged below for the next phase (full-build regeneration). |

---

## Decisions made in conversation (this pass)

### 1. Backend stack — Node.js/Express/PostgreSQL/Prisma (confirmed canonical)

**Conflict:** Full Backend Contract specified PHP (Slim 3) + MySQL + Docker on a Hetzner 4GB VPS. `schema.prisma` (`provider = "postgresql"`) and Backend Spec v2 both assumed Node/Express/PostgreSQL/Prisma. The two documents were mutually exclusive.

**Discussion:** When asked, the initial answer was "Full Backend Contract's PHP/MySQL is correct." On follow-up ("what's actually the recommended choice for latest tech + scalability?"), the reasoning given and accepted:
- The schema leans on native Postgres array columns (`Item.attributes[]`, `Role.modules[]`/`functionality[]`, `CampaignAccessGrant.outletIds[]`) — MySQL has no equivalent, so a MySQL port would need a schema redesign (JSON columns + manual validation), not a straight migration.
- Slim 3 (the specific framework named) has been EOL since its last release in 2017; Slim 4 is current. So even a PHP direction would need a different framework than the one specified.
- Postgres/Prisma give type-safe queries, tracked migrations, and generally better performance on the complex reporting/rollup queries this app needs (sku-wise, brand-wise, monthly attendance grids) at scale.
- Node scales horizontally the same way PHP does — no inherent advantage either direction on that axis. The real single-point scaling constraint in the docs was the 4GB VPS, which is a hosting decision independent of language.
- Practically, Node/Postgres was already what the schema, Spec v2, and both working prototypes were built against — switching would mean rewriting the schema and re-deriving the entire data-model section from scratch before any consistency work could even start.

**Final decision:** Node.js / Express / PostgreSQL / Prisma is canonical. Full Backend Contract's stack section is retired, not migrated toward.

### 2. Geofence check-in enforcement — soft flag only, confirmed

**Conflict:** Full Backend Contract §4.13 said geofencing is explicitly a **soft flag** — `checkInLocationVerified` is set false but check-in is never rejected. Backend Spec v2 §5.6 described the check-in flow verifying location via haversine distance without stating explicitly whether an out-of-range result blocks the check-in or merely flags it — read literally, it was ambiguous and could be (mis)implemented as a hard block.

**Decision:** Confirmed **soft flag only** — check-in never blocks on geofence, `checkInLocationVerified = false` is a review signal only. Carried into Backend Spec v3 §5.6, the schema's `AttendanceRecord.checkInLocationVerified` field comment, and Admin Panel Spec v3 §3.5.2 / §4 pattern #13 (attendance tables must render this as a flag, not an error state).

**Note:** `Outlet.geofenceRadiusMeters` stays a required stored column with a `@default(150)` in the schema — Full Backend Contract's separate "default to 200m when null" rule doesn't apply here since the column is never null in this implementation. No schema change needed for this decision beyond what already existed.

### 3. Staff HR profile fields — kept at the reduced set, confirmed final

**Conflict:** Schema + Backend Spec v2 implement 11 flattened HR fields (nic, dateOfBirth, gender, both addresses, emergency contact name/phone, four bank fields). Full Backend Contract §4.9.1 (citing the original StaffPulse admin audit) described a much larger ~30-field form across five sections, including marital status, English proficiency ratings, work-type/designation pick-lists, and a separate profile-photo upload endpoint (`POST /staff/:id/photo`). Admin Panel Spec v2 §3.5.1 ambiguously said the HR fields were "unchanged... exactly as audited," which read as implicitly pointing at the larger form without actually specifying it.

**Decision:** Keep the current reduced 11-field set. **This is now a confirmed final scope decision, not an open gap** — Admin Panel Spec v3 §3.5.1 states the field list explicitly and says so. No profile photo upload endpoint exists or is planned in this version. If the fuller HR form or photo upload is wanted later, that's a new schema migration and a new spec revision, not something to infer from the old audit notes.

### 4. Global one-open-shift lock vs. "concurrent activations allowed" — v2's behavior confirmed

**Conflict:** Backend Spec v2 §5.1 describes a global one-open-shift lock: a Staff member can only have one open `AttendanceRecord` at a time across *every* Activation they're assigned to, enforced with `409 ALREADY_CHECKED_IN`. Full Backend Contract §10.6 explicitly decided the opposite: concurrent open Activations across campaigns are allowed, with no double-booking check at check-in.

**Resolution:** Not raised as an open question this pass because the evidence was already one-sided — Admin Panel Spec v2 §1 and §3.5.2 both independently describe and design around the one-open-shift rule (including a UI note for "Checked in on {other campaign}"), meaning this behavior was already built and documented consistently everywhere except the retired contract doc. Carried forward unchanged into Spec v3 §5.1, with an explicit clarification added: being *assigned* to concurrent Activations is fine (§2.5); having two simultaneously *checked-in* shifts is what's blocked. This distinction wasn't spelled out cleanly in v2 and is worth having explicit for implementers.

### 5. Late-arrival grace period — stays 10 minutes, stays hardcoded

**Conflict:** Backend Spec v2 §5.6: 10-minute grace period, hardcoded constant. Full Backend Contract §10.9: 1-hour grace period, described as a confirmed decision.

**Resolution:** Not raised as a separate question — folded into the general "Full Backend Contract's business-logic decisions don't carry forward unless independently corroborated" resolution. 10 minutes is what's actually implemented and documented in the Admin Panel spec's cross-references. Stays hardcoded and not configurable per outlet/campaign — still an open future improvement, called out again in Spec v3 §8.

### 6. Supervisor auto-grant default scope — `"subset"` + single outlet, confirmed

**Conflict:** Backend Spec v2 §5.3: new grant is always `scopeType: "subset"` seeded with just the one outlet. Full Backend Contract §10.7: new grant defaults to `scopeType: "all"`.

**Resolution:** v2's behavior confirmed — Admin Panel Spec v2/v3 §3.3.2 independently describes and designs the confirmation-toast UX around the subset/single-outlet behavior ("Aruni Silva now has portal access to Nawala Retail Outlet on this campaign" — a message that only makes sense if the grant is outlet-scoped, not "all"). Carried forward unchanged.

### 7. Portal (`User`) refresh token — stays deferred, not built

**Conflict:** Backend Spec v2 §8 (Deferred): no refresh-token flow for `User`, re-login required on expiry. Full Backend Contract §10.1: explicitly decided to build `POST /admin/v1/auth/refresh`, mirroring the mobile flow.

**Resolution:** Stays deferred. Admin Panel Spec v2 §6 independently lists "User portal refresh-token flow" as a backend stub, consistent with v2, not the contract doc. No corroboration anywhere for the contract doc's decision actually having been implemented. Revisit only if re-login-on-expiry proves disruptive in practice — noted as a live option, not closed off permanently.

### 8. `Campaign.status` — stays a stored, auto-synced column (not purely computed)

**Conflict:** Full Backend Contract §4.4/§10.9: `status` purely computed from dates at read time, no stored column, no admin override. The Prisma schema has always had `status CampaignStatus @default(upcoming)` as a real column, and Backend Spec v2 lists it as a stored field.

**Resolution:** The schema doesn't lie — it's a stored column. Rather than just flagging this as "the contract doc is wrong," this pass adds an explicit sync rule that neither prior doc actually specified: `status` auto-recomputes from `startDate`/`endDate` on every read/write, **but** an `adm`/`usr` can also override it manually (e.g. ending a campaign early), and a manual override isn't silently clobbered by the next auto-sync unless the underlying dates change. This resolves an ambiguity that existed even between the "confirmed-consistent" docs, not just against the retired contract. See Spec v3 §5.8, schema comment on `Campaign.status`.

### 9. Roles — exactly four (`adm`, `usr`, `supervisor`, `sponsor`), confirmed

**Conflict:** Full Backend Contract §4.22/§9 listed six role ids (`adm`, `usr`, `super`, `client`, `supervisor`, `sponsor`) and a persona-mapping table that folded `super` into the "admin" persona alongside `adm`/`usr`. Backend Spec v2 and Admin Panel Spec v2 both consistently describe only four seeded roles.

**Resolution:** Four roles confirmed — matches the actual seed data (`prisma/seed.ts`) and both prototypes' role-gating logic (verified directly: `campaign-buddy-portal_Prototype.html`'s nav-filtering array only ever references `admin`/`supervisor`/`sponsor` personas, never `super` or `client`). The persona-mapping idea itself was worth keeping (see next item), just corrected to the real role set.

### 10. `roleId` → UI persona mapping — kept, corrected to 4 roles

**New in v3, not a conflict resolution:** Neither Backend Spec v2 nor Admin Panel Spec v2 had ever written down that the portal frontend collapses `adm` and `usr` into a single `"admin"` nav persona — this was only implicit in the retired contract doc's §9 table (which additionally, incorrectly, included `super` and `client`) and in the prototype's actual code (`campaign-buddy-portal_Prototype.html` uses `'admin'` as a literal string throughout its role-gating, not `'adm'`/`'usr'`). Added explicitly to Backend Spec v3 §2.7 and Admin Panel Spec v3 §1, with a specific warning: this collapsing is fine for **nav visibility** only — `usr` must still resolve to its real `roleId` for any actual data-access check (grant lookups, `outletIdsAllowed()`), since `adm` bypasses grants and `usr` does not. This distinction existed nowhere in writing before this pass.

### 11. Client-scoped ("Sponsor") reports — one endpoint, not two, confirmed

**Conflict:** Full Backend Contract §7.5.2/§10.2: explicitly decided to keep `/reports/sku-wise-client` and `/reports/brand-wise-client` as separate routes from the Admin versions, matching the original StaffPulse app. Backend Spec v2's endpoint list only ever had the single non-`-client` versions. Admin Panel Spec v2 §3.11 went further and explicitly said the old separate client-scoped routes "don't exist in the backend" and instructed collapsing the "Client Reports"/"Statistic Reports" nav sections into the single Reports section.

**Resolution:** One endpoint per report type, filtered automatically by the caller's `CampaignAccessGrant` — confirmed via the already-aligned Backend Spec v2 + Admin Panel Spec v2. No `-client` routes anywhere in Spec v3.

### 12. Live tracking endpoint — campaign-scoped, not global

**Conflict:** Full Backend Contract §10.4 explicitly decided live tracking should be a **global** endpoint (no `campaignId` in the path). Backend Spec v2 §4.2 implements it nested under the campaign-scoped router: `GET /campaigns/:campaignId/tracking/live`.

**Resolution:** Campaign-scoped, per v2 — this wasn't asked about explicitly in conversation, but it's resolved the same way as every other Full-Backend-Contract-vs-implemented-system conflict: v2 matches what's actually built, and a global tracking endpoint would sidestep `CampaignAccessGrant` scoping entirely, which conflicts with the uniform enforcement model the rest of the API depends on (§3.3 of Spec v3 — every campaign-scoped resource goes through `requireCampaignAccess`; carving out one global exception for tracking would be a real architectural inconsistency, not just a style choice). Explicitly called out in Spec v3 §4.2 and §5.9 rationale so this doesn't get silently re-decided later by someone reading the retired contract doc.

### 13. Assign Routes / `SupervisorRoute` — built this pass

**Status before this pass:** No backend entity anywhere. Full Backend Contract §7.7.3 sketched an endpoint shape (`GET/POST /admin/v1/supervisor-routes`, global, no `campaignId`) but Backend Spec v2 never had this at all — it was one of the "new endpoints with no home in either prior doc."

**Decision (explicitly confirmed in conversation):** Build it now, as a new `SupervisorRoute` model. **Design choice made in this pass** (not dictated by either prior doc): scoped it to a specific `campaignId` rather than fully global, so it enforces through the same `requireCampaignAccess`/`CampaignAccessGrant` mechanism as every other resource in this API, instead of needing a bespoke global-endpoint auth path. This is a deliberate deviation from Full Backend Contract's sketch, made for architectural consistency, not because the contract doc's shape was factually wrong (it was just never actually implemented either way, so there was no "existing behavior" to preserve).

**What was added:**
- `SupervisorRoute` model in `schema_v3.prisma` (§2.6 of Spec v3): `id`, `campaignId`, `supervisorStaffId`, `outletIds[]`, `dateFrom`, `dateTo`, timestamps.
- `GET/POST/PATCH/DELETE /admin/v1/campaigns/:campaignId/supervisor-routes` in Spec v3 §4.2.
- Business logic note in Spec v3 §5.9.
- Admin Panel Spec v3 §3.7.4 fully unblocked, with the form/list fields specified.
- Known Gaps list in Admin Panel Spec v3 §6 updated to strike this item.

### 14. Two other homeless endpoints from Full Backend Contract §7.7 — salvaged, no conflict

These had no conflict to resolve — they simply didn't exist in Backend Spec v2 and were worth keeping since they back real Admin Panel screens with no other route to call:
- **Staff evaluation** (§7.7.1 → Spec v3 §4.2, Staff pool section): `GET /admin/v1/staff/:staffId/evaluation?dateFrom=&dateTo=`. Kept as a global (not campaign-scoped) endpoint, matching how the rest of the Staff pool section works (`GET /staff`, `PATCH /staff/:id` are also global) — an evaluation reasonably spans a staff member's work across multiple campaigns.
- **Update Sales lookup** (§7.7.4 → Spec v3 §4.2, Operations section): the cascading-dropdown load step before the portal's editable Update Sales grid. **One change from the original sketch:** Full Backend Contract specified this as a global endpoint with `campaignId` as a query parameter (`GET /admin/v1/sales/lookup?campaignId=...`); moved it to nest under the campaign-scoped router (`GET /campaigns/:campaignId/sales/lookup?...`) for the same reason as item 12 above — so it's covered by `requireCampaignAccess` like every other outlet-touching read, rather than needing manual grant-checking logic inside the handler.

`SupervisorTask` CRUD (§7.7.2) was **not** salvaged — stays deferred, matching both Backend Spec v2 §8 and Admin Panel Spec v2 §3.7.1, neither of which this pass had reason to revisit.

---

## Flagged for the next phase (full-build regeneration) — not fixed in this spec-only pass

These are prototype/implementation-level drifts, not spec conflicts, so they weren't corrected as part of regenerating the specs. Worth actioning when the actual build is regenerated from these specs:

1. **`campaign-buddy-portal_Prototype.html` still has a separate "Client Reports" nav item** (`clientReports`, route `/reports/item_wise_c`, visible to `admin`/`sponsor`). Admin Panel Spec v3 §3.11 says this should be collapsed into the single Reports section — the prototype predates that reconciliation and needs updating when the portal is rebuilt.
2. **The same prototype's role-gating uses literal `'admin'`/`'supervisor'`/`'sponsor'` strings**, not real backend `roleId` values. Fine as a nav-persona abstraction per decision #10 above, but the real auth integration needs an explicit `adm|usr → "admin"` mapping layer in code — don't let the prototype's hardcoded strings become the actual permission check.
3. Neither prototype has any UI yet for the new `SupervisorRoute`/Assign Routes screen (didn't exist as a concept until this pass) or the Staff Profiles evaluation view (Spec v3 §4.2) — both need building, not just reconciling, in the next phase.
