# Campaign Buddy — Product Charter

The single source of truth for **what Campaign Buddy is for** and **how we decide what goes in**.
The Product Owner (PO) agent ([`product-owner-agent.md`](product-owner-agent.md)) judges every
issue and pull request against this file. Only the owner edits it. Where it says *"owner decision
pending"*, the agent treats the question as open and flags any change that quietly assumes an answer.

Last reviewed: 2026-10-02 (D1–D3 decided — deployment-per-agency, nothing shared, agency is the
customer of record; see §2 and §6).

---

## 1. True north

Campaign Buddy becomes **the system of record for in-store product activations in Sri Lanka** —
the place every agency runs its promoters, and every brand looks to see what happened in the
store — replacing WhatsApp photos, paper stock sheets and end-of-week spreadsheets.

**North-star measure: share of Sri Lankan in-store activations run on the platform.**
Every change is judged by whether it helps an agency *start* running activations here, *keep*
running them here, or *bring more of them* here. Three things move that number:

| Lever | What it means | Typical evidence |
|---|---|---|
| **Onboardability** | A new agency can be set up and running a campaign without us hand-holding or writing code for them. | Self-serve setup, configuration instead of custom code, working guides. |
| **Field reliability** | A promoter's shift works in a mall basement on a cheap phone, and never loses a day's data. | Offline-first flows, small payloads, no crashes, no re-entry. |
| **Data trust** | Agencies and brands accept the sales, stock, footfall and attendance numbers as the truth, with no side spreadsheet. | Auditable corrections, correct rollups, reports that match the field. |

Revenue (per-agency / per-seat licensing — usage metering already exists) follows coverage; it is
not the measure.

## 2. Market model

**Multi-agency SaaS.** Many agencies, each with its own staff, clients and campaigns, on one
platform, with strict data isolation between them.

- **Now:** Sri Lanka. LKR, Asia/Colombo, mobile-number login, English UI.
- **Later (explore, don't build yet):** other markets. So Sri Lankan assumptions are **defaults, not
  hard-codes** — currency, timezone, phone region and language must be able to become per-agency
  configuration without a rewrite.

### Decided (2026-10-02): deployment-per-agency, nothing shared

Each agency runs its own fully separate deployment of the stack (its own `docker-compose` instance,
its own PostgreSQL, its own uploads) — not one shared multi-tenant platform. **Nothing is global
across agencies**: cities, outlets, retail chains and the item catalog are each agency's own data,
not shared reference data. This was chosen over building a shared-database tenant model because it
makes isolation a property of infrastructure, not of every query having to remember a `WHERE
agencyId = ?` — cheaper to get right now, at this scale.

What this means in practice:
- **Do not build a shared/multi-tenant schema.** An `agencyId`/`organisationId`/`tenantId` column
  spanning multiple agencies' data in one database is a reversal of this decision, not a step toward
  it — propose it to the owner before building it, don't add it incidentally inside an unrelated PR.
- **Isolation risk moves to anything that *is* shared.** This repo's own product-building tools
  (`triage-agent/`, `product-owner-agent/`, `campaign-buddy-mcp/`'s coverage tooling) and anything
  agency-facing that becomes centralized later (e.g. a shared license/billing server, a shared
  landing site backend, a shared image/CDN host, a shared auth/SSO provider) are the places that
  must not leak one agency's data to another — see §4.1-2 and the `tenant_isolation` category in §7.
- **The operational cost moves to provisioning and upgrades.** N agencies = N deployments to stand
  up, patch and upgrade in step. `dev.sh`, `deploy-prod.sh` and the `docker-compose*.yml` files are
  what make that repeatable — keep them so, and treat a change that makes per-deployment setup more
  manual (rather than more scripted) as a cost worth naming (§7 `scale`/`cost`, advisory).
- **Revisit if:** an agency needs to see another agency's data by design (e.g. a sponsor/brand
  running activations through two agencies wants one combined view), or the number of deployments
  outgrows what scripted provisioning can handle. Either is an owner decision, not something to
  solve by quietly merging agencies into one database.

## 3. Scale target (12–18 months)

**5–10 agencies, about 2,000 promoters total** — in practice, **5–10 independent deployments**, each
sized for roughly one agency's promoter count, not one shared database carrying all of them. Each
deployment is a modest load: a single well-run PostgreSQL and API on a VPS is enough per agency. The
agent must **not** push for infrastructure beyond this (queues, sharding, Kubernetes, a shared
database across agencies) without a concrete trigger, and must **not** accept designs that fall
over at 10× one agency's size (unbounded list endpoints, per-request table scans, missing indexes,
files on one node's disk with no backup).

## 4. Principles

### 4.1 Non-negotiable (a conflict is a hard block)

1. **Offline-first field use.** Core promoter flows (check in/out, stock, sales, footfall) work with
   no signal and sync later without loss or duplication. Old app versions can replay queued
   payloads days later, so the server must keep accepting them.
2. **Strict tenant data isolation.** One agency can never see, infer or modify another agency's data.
   Today that's mostly guaranteed by deployment separation (§2); it still binds on anything that
   *does* span agencies — this repo's own agents, and any future shared/central service — through
   any surface: `/v1`, `/admin/v1`, reports, exports, file URLs, the MCP server, logs.
3. **Low-end Android on patchy 3G.** Small payloads, light screens, compressed photos, no heavy
   dependencies in the mobile app.
4. **PDPA and staff privacy.** Location trails, national IDs, bank details and photos are collected
   for a stated purpose, exposed to the minimum roles, and deletable/retainable on a policy.
5. **Promoter simplicity.** A promoter's daily flow stays a handful of taps. Complexity belongs in
   the portal, never in the shift.
6. **Runs cheaply on a VPS.** A small team can operate it. Heavyweight infrastructure needs a
   concrete, measured trigger.

### 4.2 Secondary (advise, never block)

- **Sinhala and Tamil.** English-only is acceptable now. But do not make it *harder* later: no
  concatenated user-facing strings, no text baked into images, no layouts that break at +40% width.
- **Sri Lanka-native defaults.** LKR, Asia/Colombo, +94 numbers, local retail-chain conventions come
  first. Hard-coding them where a per-agency setting would be equally easy is a concern (§7).

## 5. Decision rules

For every proposed change the PO agent asks, in order:

1. **What outcome does the requester ultimately need?** (Not the feature as worded — the job behind it.)
2. **Does it move the north star** (onboardability, field reliability, data trust)? If not, why do it now?
3. **Is there a generic form?** Configuration, a setting or a reusable field beats bespoke code.
4. **Does it hold the six non-negotiables (§4.1)?**
5. **Does it survive 10× the scale target, and cost little to run?**
6. **Is it the smallest change that delivers the outcome?**

### Requests from one client or agency
**Generalise first.** The default is a configurable, reusable solution (as with custom sales fields
and the configurable staff designation label). Bespoke code is accepted only if the agent cannot find
a generic form *and* the owner names it as blocking an onboarding — and even then the objection is
recorded so the cost to generality stays visible. *(Owner may change this rule.)*

## 6. Where the platform stands against this charter

Findings from the 2026-09-22 architecture review, checked against the code. **These are the gaps the
agent tracks.** A change that widens a gap is an objection; a change that closes one is welcome.

| # | Gap | Evidence | Why it matters for the target |
|---|---|---|---|
| **G1** | ~~No tenant model~~ — **resolved by decision, not code** (§2). | `prisma/schema.prisma`: 31 models, no organisation/agency/tenant column. Access is per-campaign grants only. | Correct for deployment-per-agency: there's exactly one agency per running backend, so there's nothing to scope. Stays resolved only as long as no PR adds a tenant column "for later" — that would be a silent move toward shared tenancy; flag it, don't build it unasked. |
| **G2** | **No client-version gate.** | No min-app-version header, endpoint or force-update path in backend or app. | Offline queues mean old apps replay old payloads. Without a version gate, any API contract change risks silently breaking promoters in the field. Applies within one agency's deployment, same as before — unaffected by the deployment-per-agency decision. |
| **G3** | **No API hardening layer.** | No rate limiting or security-headers middleware found in `campaign-buddy-backend/src`. | Lower urgency under deployment-per-agency (each instance serves one trusted agency, not a shared public multi-tenant API), but still worth having per instance against scraping/abuse. Advisory, not a block, unless an instance is reachable from the public internet with no auth in front of it. |
| **G4** | **Uploads on local disk, served statically.** | `imageUpload.ts` + `/uploads` static serving. | No longer a cross-tenant leak under deployment-per-agency (each agency's uploads are already on its own box). Still a single-node risk *within* that agency: no backup of `/uploads`, no object storage, so a disk loss loses every outlet photo for that agency. Advisory (`data_loss_offline`-adjacent) — becomes a block if a specific agency's backup story turns out to not exist. |
| **G5** | **Locale hard-coded.** | `Asia/Colombo`, `LKR` and `+94` literals in roughly 30 files across backend, portal and app (some are tests/seeds). Campaign already has a timezone field. | Cheap to stop adding more now; expensive to unpick later. Needed to explore other markets. |
| **G6** | **No i18n scaffolding.** | No i18n library in app or portal. | Acceptable now (§4.2). Keep new copy easy to extract. |
| **G7** | **Privacy lifecycle undocumented.** | Specs cover collection (location trail, HR profile with bank/ID fields) but no retention, deletion or access-audit policy. | PDPA (§4.1-4). Needed before onboarding agencies that hold staff data. |
| **G8** | **Offline gaps.** | Deferred by decision: supervisor checklist offline, offline password login, supervisor route check-in/out. | Supervisors in basements are affected. Prioritise by field evidence. |
| **G9** | **Unverified: backups, monitoring, restore drills.** | Not covered by the specs reviewed. | Data trust depends on never losing a day. The agent should ask for evidence, not assume. |

**Strengths to protect:** offline sync with a `capturedAt` trust rule and multi-outlet shifts; CI with
real Postgres plus e2e; a working training-guide-in-product discipline; per-campaign license
metering (billed per agency — see D3 below); an MCP server with a coverage gate (one instance per
agency deployment, same as the backend it reads — no cross-agency coverage concern as long as G1
stays resolved).

### Owner decisions — resolved 2026-10-02
- **D1 — Tenancy route: deployment per agency**, not a shared multi-tenant platform. See §2.
- **D2 — Nothing is shared across agencies.** Cities, outlets, retail chains and the item catalog are
  each agency's own data, same as everything else. No global reference layer.
- **D3 — Customer of record: the agency.** The agency pays and administers the account (license-usage
  metering already bills per seat/campaign within one agency's deployment); brands/sponsors stay the
  read-only guests they already are in the role model (§1) — not a second billing relationship.

These three travel together: per-agency deployment (D1) only works cleanly because nothing is
shared (D2), and licensing stays simple because there's one payer per deployment (D3). Re-open all
three together if any one of them is revisited.

## 7. Severity: what blocks, what advises

**Block (hard)** — the PO status check fails and `approved-for-build` is withheld until resolved or
overridden (§8). Only these categories block:

| Category | Blocks when the change… |
|---|---|
| `tenant_isolation` | adds or relies on anything shared across agency deployments without isolation (a central service, a shared database/bucket/host spanning agencies), or quietly reintroduces a cross-agency tenant model (an `agencyId`/`tenantId` column meant to span multiple agencies' data in one database) contrary to the D1/D2 decision in §2/§6 — propose that to the owner, don't build it. |
| `security_privacy` | weakens auth, exposes personal/financial/location data more widely, or collects it with no stated purpose. |
| `data_loss_offline` | can lose or duplicate field data (destructive migration, breaking the offline queue or its replay). |
| `breaks_shipped_clients` | changes an API/response contract in a way app versions already in the field cannot handle, with no compatibility path. |
| `scope_creep` | adds permanent complexity for everyone to serve one bespoke need, when a generic form exists. |

**Advise (comment only, never blocks):** `scale`, `cost`, `locale_hardcoding`, `simplicity`,
`missing_tests_or_guides`, `other`.

The agent must never block on taste. A block needs a named category, a plain-language impact and a
recommended route to the outcome.

## 8. How an objection must read

Every objection is written to be understood in under a minute:

1. **TL;DR** — one sentence: what's wrong and what to do instead.
2. **Impact** — who is affected, what goes wrong, how badly, at what scale (concrete, not abstract).
3. **Which principle** it conflicts with, and the evidence (file:line or issue text).
4. **The outcome you're actually after** — the job behind the request, restated.
5. **Options to get there** — at least one, with effort, marking the recommended one. Always include
   a *smallest-safe-version* option when the full ask is blocked.
6. **If you need this now** — how to override in one step and what follow-up that creates.

## 9. Override protocol (urgent needs)

The owner can always ship. Adding the **`po-override`** label to the PR or issue:

- turns the PO status green / releases `approved-for-build` **immediately** — no reason required to
  unblock;
- is honoured **only when applied by the owner** (not by the bot or anyone else);
- makes the agent open a **follow-up issue** (`po:decision`) that records what was objected to, that
  it was overridden, and the remaining work to close the gap; a one-line reason in a comment is
  welcome and is recorded, but never required.

Overrides become **precedent**: the agent reads recent `po:decision` issues so it does not re-raise
a settled objection and keeps its advice consistent with how the owner actually decides.
