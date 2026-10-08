# Multi-Vendor Architecture Research

**Status:** Research / decision-support document — no build decision locked in yet.
**Date:** 2026-10-02
**Scope:** How to turn Campaign Buddy from a single-tenant product into a multi-vendor SaaS, comparing per-vendor stacks vs. shared stack, with capacity, scaling, and industry-practice context for this codebase (Node/Express + Prisma + PostgreSQL backend, React portal, React Native app).

---

## 1. The two models

> **Current context:** there are 2 vendors onboarding. At this scale, Model B's control plane / provisioning machinery is the same engineering effort whether you have 2 vendors or 20 — the setup cost is front-loaded, the payoff only arrives with volume. Model A's migration (add `vendorId` + scoping) serves both vendors immediately with near-zero new infrastructure. This document's recommendation therefore leans strongly toward Model A as the default (§7), with Model B held as a future enterprise tier.

| | **A. Shared stack, multi-tenant DB** | **B. Separate stack per vendor** |
|---|---|---|
| Definition | One app deployment, one (or few) Postgres DBs. All vendors' data lives together; every row carries a `vendorId`. | Each vendor gets their own Docker stack: own app container(s), own Postgres, own URL (`vendor.campaignbuddy.lk`). |
| Data isolation | Logical (row-level, enforced by code) | Physical (separate DB per vendor) |
| Deployment | One deploy serves all vendors | N deploys, one per vendor |
| URL scheme | `app.campaignbuddy.lk` (tenant via login/subdomain cosmetic) | `vendor.campaignbuddy.lk` per vendor |

---

## 2. Model A — Shared stack, multi-tenant database

### 2.1 Architecture

```
                      ┌──────────────────────────────┐
portal / RN app ─────►│  Express API (one deploy)    │
                      │  ─ resolve vendorId from JWT │
                      │  ─ Prisma scoping middleware │
                      └───────┬──────────────────────┘
                              │
                      ┌───────▼──────┐
                      │  PostgreSQL  │
                      │  vendorId on │
                      │  every row   │
                      └──────────────┘
```

Key components:

- **`Vendor` model** in Prisma; every tenant-owned table (campaigns, outlets, attendance, sales, footfall, tracking, reports) gains `vendorId`.
- **Scoping enforced at the Prisma layer** — client extension / middleware that injects `vendorId` from the authenticated token into every query. Never trust client-supplied vendor IDs.
- **Postgres Row-Level Security (RLS)** as a defense-in-depth backstop: `SET app.vendor_id = ...` per request/connection, policies reject rows outside the vendor. Protects against a missed `where` clause.
- Auth/users can be global (single login domain) or vendor-scoped; both work.
- Reference/shared content (training guides, titles) stays global.

### 2.2 Pros

- **Cheapest to run.** One server, one DB, one set of backups/monitoring; idle vendors cost nothing extra.
- **One migration run per deploy.** 50 vendors = 1 migration, not 50.
- **New vendor = a signup row**, effectively instant; no provisioning pipeline needed.
- **Cross-vendor analytics possible** (platform-wide dashboards, "how do vendors compare") — critical if *we* are the SaaS operator selling to multiple vendors, and impossible in Model B without extra plumbing.
- Single codebase, single CI pipeline, no drift risk between instances.
- Matches current repo with a phased, incremental migration path.

### 2.3 Cons

- **One bad query or missing `where vendorId` leaks another vendor's data.** The killer risk; requires RLS + tests, not just discipline.
- Noisy neighbours: one vendor running a heavy report can degrade everyone (mitigable with per-vendor rate limits / query timeouts).
- No per-vendor customisation or deployment timing; a bad deploy hits all vendors at once.
- Per-vendor DB-level guarantees (dedicated backups, PITR windows, data residency) are hard to honour; a restore-touches-everyone situation.
- Larger shared DB: Postgres still handles this comfortably to tens/hundreds of vendors, but single-DB scaling has a ceiling (see §5).
- Compliance-bound customers (data residency, "our data must not touch other vendors'") may be unservable.

### 2.3a Mobile API URL handling (Model A)

The simplest case: **one API URL for everyone.** The RN/Expo app keeps a single build-time `EXPO_PUBLIC_API_URL` pointing at `api.campaignbuddy.lk` (or the shared domain). The vendor is not in the URL at all — it travels in the **JWT**, embedded at login: either the rep's email domain maps to a vendor, or the vendor selection happens on the login screen and is sent as a parameter; the backend returns a token whose claims include `vendorId`. URL handling in the app is literally unchanged from today — this is a strong secondary argument for Model A.

---

## 3. Model B — Separate stack per vendor

### 3.1 Architecture

```
vendor1.cb.lk ─┐
vendor2.cb.lk ─┼─► Reverse proxy (Traefik / nginx / Caddy)
admin.cb.lk  ──┘        ├─► stack 1: portal + API + Postgres
                        ├─► stack 2: portal + API + Postgres
                        └─► ...one per vendor

            ┌──────────────────────────┐
            │  Control plane (master)  │  ← the piece Model A doesn't need
            │  tenants, subscriptions, │
            │  provisioning, billing   │
            └──────────────────────────┘
```

- **Routing layer:** one Traefik (recommended: auto-discovers Docker containers, handles Let's Encrypt **wildcard cert** `*.campaignbuddy.lk` via DNS-01) or nginx in front. Route `*.campaignbuddy.lk` → the matching stack.
- **Vendor resolution:** the entry stack reads the JWT (contains `vendorId`) or the route table maps subdomain → stack. Never trust a client-supplied vendor ID alone (§3.3a, §2.3a).
- **Same subdomain serves portal + API** per vendor (portal calls `/api` relatively). The RN app then needs no per-vendor URL logic beyond the vendor's own domain.
- **Identical images everywhere.** Only `DATABASE_URL` and branding env differ. Custom forks are how siloed SaaS rots — rule them out from day one.
- **Control plane is mandatory:** a small master service/DB owning tenant registry, subscriptions, and provisioning (create DB → create stack → register proxy route → done). Vendor onboarding should ideally be one command/script or a UI button.

### 3.2 Pros

- **Strong isolation.** No cross-vendor data-leak class of bug at all; a leaked credential exposes one vendor, not the platform.
- Physical guarantees: per-vendor backups, restore one vendor without touching others, per-vendor data residency is trivial.
- Noisy neighbours largely solved — heavy vendor only slows themselves (shared host excepted).
- Per-vendor deploy timing / maintenance windows possible (use sparingly; see cons).
- Easier to win compliance-sensitive enterprise deals on paper ("your data is in its own database").

### 3.3 Cons

- **Operational cost scales linearly with vendors.** N vendors = N migration runs, N backup schedules, N monitoring targets, N SSL certs (wildcard helps), N sets of connection pools eating the same host's RAM.
- **Provisioning machinery is required** (control plane, provisioning scripts, DNS/registry automation) — real engineering work before vendor #1 exists.
- **Cross-vendor analytics/"all vendors" admin view is essentially impossible** unless vendors sync data to the master DB — which reintroduces half of Model A's complexity.
- Higher idle cost: an inactive vendor still runs its whole stack.
- Drift risk: any divergence in versions/seeds/config between stacks becomes a slow-motion outage source (mitigate by containerising *everything* and version-pinning).
- On the current likely hardware, vendor capacity is bounded by host RAM (see §4) — 15–30 light vendors per beefy server before you're buying machines.

### 3.3a Mobile API URL handling (Model B)

With per-vendor stacks, each vendor's API lives at its own host, so the app must know *which* vendor stack to call. Options, from simplest to most flexible:

1. **Per-vendor app builds (not recommended).** Bake `EXPO_PUBLIC_API_URL=https://vendor1.cb.lk` into a build channel per vendor. Works, but multiplies builds/artifacts/releases by vendors — a release-management tax that grows linearly.
2. **Single build, runtime vendor entry (recommended baseline).** Ship one app; on first launch the rep types/picks the vendor (e.g. via a branded login screen): the app derives `api.<vendor>.cb.lk` (or just executes `https://<vendor>.cb.lk/api`) and stores it in secure storage. All subsequent requests go there.
3. **Branded onboarding URL / deep link / QR.** Vendor invites reps with a link like `campaignbuddy://join?vendor=vendor1` or a QR code shown at training. The app resolves the vendor's API base from the link, then persists it. Zero typing; good field-rep UX.
4. **Discovery endpoint on the main domain.** The app always calls one stable URL (`https://api.campaignbuddy.lk/resolve?vendor=vendor1`) hosted on the control plane, which returns the vendor's actual API base (including any future siloed instance). Best long-term: the routing table moves server-side, so re-homing a vendor doesn't require reps to re-enter anything — the app just re-resolves on login.

Practical notes either way:

- **Offline sync must key off the vendor, not just cached URLs** — field reps are offline-prone; a stale/wrong base URL while offline should fail loudly before it syncs to the wrong stack. Include a `vendorId` claim in JWTs (see §2.3a) as a second line of defence so even a URL mix-up can't cross-write.
- **Push notifications and deep links** must carry the vendor context too (the provider topic/payload needs vendor disambiguation in Model B; in Model A the shared backend already knows).
- Expo `EXPO_PUBLIC_*` vars are inlined at build time — they give you the *default/fallback* URL, not a runtime switch; runtime switching requires storing config in the app or using option 3/4.

### 3.4 Variant worth noting: siloed DB, shared app image

Middle path: one app deployment fleet / shared image, but each vendor subdomain resolves to an app instance pointed at a **separate `DATABASE_URL`**. Gets the physical-data isolation of B without fully separate stacks. Complexity of routing + provisioning remains; cross-vendor analytics remains lost. Useful if isolation is demanded but full silos are overkill.

---

## 4. Request capacity

Rough, honest numbers for this stack (Express + Prisma + Postgres on a single modern 4–8 vCPU server). Treat as order-of-magnitude, benchmarks should validate.

| Model | Approx. sustained request rate | Notes |
|---|---|---|
| A. Shared stack, single node | **~2,000–5,000 req/s** simple CRUD; real-world mixed workload comfortably ~500–1,500 req/s | Node is I/O-bound; Postgres is the real bottleneck once per-request queries hit 1–5 DB round trips (Prisma). |
| A. Shared, 3–4 API nodes behind LB + managed/robust Postgres | **5,000–15,000+ req/s** | Postgres sized appropriately (8+ cores, good NVMe) remains the ceiling driver. |
| B. Per-vendor stack (one small container + small Postgres) | **~100–300 req/s per vendor** light stack; **2,000–5,000** at full 4–8 vCPU dedicated to that vendor | N vendors multiply this, but only on the same host — then you buy more hosts. Host RAM is the quiet limiter: each stack needs Postgres (~100–500 MB idle) + Node (~100–200 MB); ~30 vendors per 32–64 GB server. |

Context for this product: field-rep apps check in a few times daily, attendance/sales syncs are low-rate bursts (morning/evening), portal use is business-hours only. **Command Buddy's realistic demand is tiny relative to either model's ceiling** — nearly all vendor counts up to ~50–100 are fine on Model A single-node, and Model B's costliness, not capacity, is its problem.

---

## 5. Scaling when demand gets high

Shared-stack (Model A) scaling path, in the order you'd actually adopt it:

1. **Vertical first** — bigger DB box, better disks. Covers a long way in Postgres.
2. **Read replicas** — Postgres streaming replicas; read-heavy routes (reports, dashboards) read from replica. Prisma supports read replica routing.
3. **Stateless API horizontal scale** — the Express API already is stateless-ish (JWT auth); run N containers behind a LB. No code change needed.
4. **Caching** — Redis for hot reference data, rate limiting, and session-independent lookups.
5. **Job queue offload** — reports/exports/season-summary queries move to background workers (BullMQ etc.); API stays fast.
6. **Partitioning by vendor** — Postgres declarative partitioning on `vendorId` keeps index sizes sane at scale.
7. **Sharding by vendor if truly needed** — separate DB clusters for groups of vendors; note this converges on Model B's shape, reached only when data volume, not tenancy, demands it.

Silo-model (Model B) "scaling" is just horizontal: add hosts, move stacks, keep identical images. Its real scaling challenge is operational automation, not request throughput.

---

## 6. What's industry standard?

- **The standard SaaS tenancy model is: shared app, shared DB, logical tenant isolation** (`tenant_id` scoping + RLS-style enforcement). Stripe, Slack, GitHub, Atlassian Cloud, Linear, virtually every B2B SaaS starts here and most stay. Postgres RLS is the widely cited enforcement backstop.
- **Dedicated/siloed infrastructure is the premium enterprise tier**, not the default: AWS SaaS Factory guidance and similar industry reports consistently recommends shared-by-default, silo-on-demand for customers with compliance/regional requirements and the price tag to justify it.
- **Subdomain-per-tenant routing** is standard and uncontroversial (`acme.hubspot.com`, `acme.slack.com`) with what it *routes to* being the actual decision.
- Common maturity ladder in the literature: shared DB shared schema → (schema-per-tenant, now mostly deprecated as a practice) → pool model (shared with partitioning/RLS) → silo (dedicated) per tenant for premium tiers. Campaign Buddy currently sits "before step one"; the industry-standard target is the pool model with silos offered as a paid enterprise option later.

## 6a. Additional decision-making factors

Factors beyond the core comparison that should weigh on the choice:

1. **Who is the vendor, and who are its users?** If the "vendors" are direct customers of *ours* (B2B SaaS, each with their own outlets/promoters), Model A fits naturally. If each "vendor" is really an independent business with their own admin needing white-labelling (own branding, own login page, custom email domain), the balance shifts toward B or the hybrid.
2. **White-labelling requirements.** Custom logos/colours per tenant is easy in Model A (tenant profile data). Custom domain for the *portal* (`portal.vendor.lk`) is trivial in Model B, painful-but-doable in Model A (routing layer resolves hostnames → tenant).
3. **Team size & ops maturity.** Model B silently assumes you can run infra-at-scale (scripted provisioning, monitoring, on-call across N stacks). A 1–2 person team should default to Model A.
4. **Data migrations & schema evolution cadence.** In Model B, every schema change multiplies: consider how often you ship backend changes (currently: frequently). If you ship weekly, N stacks = N migration failures to babysit eventually.
5. **Testing & CI surface.** Model A: one e2e suite with multi-vendor test fixtures. Model B: multi-stack drift testing (CI should at minimum verify every stack's image version after upgrades) — new automation to build.
6. **Pricing/business model coupling.** Per-vendor stacks make usage-based billing harder (metering across stacks needs aggregation); shared DB makes metering trivial. If pricing tiers will include "dedicated infra", that tier can be the silo path (§3.4).
7. **Regulatory/compliance roadmap.** Sri Lanka CDPA / GDPR-ish requirements, or an enterprise buyer demanding contract terms like "data retained in X region" — that buyer makes the silo tier revenue-relevant.
8. **Backups & restore semantics.** Decide now: "restore this vendor to yesterday" — in Model A this is a PITR swan-dive affecting everyone (must also undo other vendors' writes since backup); in Model B it's routine.
9. **Security incident blast radius.** In Model A, one compromised DB credential = all vendors; in Model B = one. Conversely, N stacks means N attack surfaces that must each be kept patched — the shared single appliance is audited once.
10. **Feature gating / version skew between tenants.** Model A gives natural A/B flagging per vendor; Model B makes "vendor X is 2 versions old" a permanent possibility.
11. **Recruiting/junior-developer safety.** Model mistakes are worse for smaller teams; shared-stack multi-tenant code requires *careful* query hygiene discipline (typed Prisma ext + RLS are the guardrails).
12. **Sunk mobility of the decision.** Model A → add Model B later (for enterprise tier): moderate work, keep the hybrid path alive (§3.4). Model B → re-converge to Model A later: extremely hard (data lives in scattered DBs, and merging history must be written once per tenant with zero error tolerance).
13. **Time-to-first-revenue.** Model A ships in weeks as a migration; Model B ships in months because the control plane is a prerequisite. If the multi-vendor push has a deadline, Model A wins the schedule argument outright.
14. **Per-vendor observability & SLO promises in SLAs.** If SLAs will promise per-vendor uptime, Model B makes "vendor X's SLA" measurable per stack trivially; in Model A, you're measuring platform-wide uptime for all.

---

## 7. Recommendation

**Adopt Model A (shared stack, multi-tenant DB with `vendorId` scoping + Postgres RLS) as the default**, with the Model B machinery (subdomain routing, identical-image stacks) available as an **enterprise/siloed tier offered selectively** when a specific vendor demands physical isolation or data residency — the hybrid in §3.4.

Rationale:

1. Current and foreseeable traffic is far below either model's capacity ceiling — Model A's only real drawback (leak risk) is well-solved with RLS + tests, while Model B's drawbacks (linear ops cost, mandatory control plane, lost cross-vendor analytics) are structural.
2. The shared model preserves the platform-level analytics that a SaaS operator needs to run the business.
3. The subdomain routing work is worth doing anyway, and it makes the eventual enterprise-silo tier cheap to bolt on.

Phased migration sketch (for a future spec, not this document):

1. Add `Vendor` model + `vendorId` columns; backfill to a single system vendor.
2. Enforce scoping via Prisma extension from JWT claims; add regression tests for tenant leakage.
3. Enable Postgres RLS policies as backstop.
4. Stand up `*.campaignbuddy.lk` routing (Traefik + wildcard cert) — cosmetic win, isolation-tier enabler.
5. Build the provisioning script for on-demand silo stacks (enterprise tier).
