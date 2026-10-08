# Multi-Vendor Campaign Buddy — Architecture Document

**Status:** Proposed architecture for review.
**Date:** 2026-10-02
**Related docs:** `docs/multi-vendor-architecture-research.md` (options analysis), `docs/backend-spec.md`, `docs/api-spec.md`, `docs/admin-panel-spec.md`
**Decision context:** 2 vendors now; choose the model that serves them immediately and keeps the enterprise/isolated tier open as a paid option later.

---

## 1. Decision summary

Per `docs/multi-vendor-architecture-research.md`: **Model A — shared stack, multi-tenant database**, with the silo machinery (Model B) deferred to an opt-in enterprise tier. At 2 vendors no silo infra is built; both vendors are tenant rows in the one database.

---

## 2. Goals & non-goals

**Goals**

1. Two vendors live on the current single deployment with no new runtime services required.
2. Tenant isolation is enforced in three layers: route/token → Prisma scoping → Postgres RLS.
3. New vendor onboarding < 1 day, no code changes, no infra changes.
4. Platform (operator) analytics remain possible.
5. Preserve a clean future path to siloed stacks per vendor without rewriting tenants.

**Non-goals (for this phase)**

- Per-vendor custom domains or white-labelled portals (design leaves room; not built).
- A provisioning control plane (only built with the first enterprise-silo customer).
- Sharding / per-vendor DB clusters.

---

## 3. System layers

### 3.1 Edge / routing layer

Present: Cloudflare tunnel (`cloudflared`, remotely-managed ingress in the Zero Trust dashboard) → portal, backend, marketing, app-web containers.

Multi-vendor addition: **none required now.** All vendors ride `app.campaignbuddy.lk`, `api.campaignbuddy.lk`, etc.; tenancy is resolved in the token, not the hostname.

Reserved for the enterprise tier: wildcard `*.campaignbuddy.lk` routing where `<vendor>.` resolves to a silo stack. The tunnel/proxy layer already supports service-per-hostname mapping, so this is configuration, not architecture, when needed.

### 3.2 Access / presentation layer

Unchanged in structure; tenant-awareness added:

| Surface | Container | Multi-vendor behaviour |
|---|---|---|
| CB Office (portal) | `portal` (React/Vite + nginx) | Session JWT carries `vendorId`; every fetch calls `/api/v1/*` scoped server-side. Portal can render vendor branding/logo from vendor profile. |
| CB Mobile (field reps) | `app` (Expo web; native later) | **One build, one API URL (`EXPO_PUBLIC_API_BASE_URL`) — unchanged.** Rep logs in; JWT carries `vendorId`. No per-vendor URL logic on the client. (Research §2.3a) |
| Marketing + training | `marketing` (nginx, static) | Global, not tenant-scoped. Training guides can gain vendor branding via CSS variables only if a customer asks. |

Client-side tenancy rule: the client may *display* the tenant but never *asserts* it — all scoping is server-side.

### 3.3 API layer (`backend`, Express + TypeScript)

- **Auth:** unchanged JWT flows (staff + user secrets in compose env). Change: access tokens gain a `vendorId` claim, minted at login from the resolved vendor (by email domain initially; a vendor picker on the login screen if domains overlap). Refresh-token rotation preserves the claim.
- **Request context:** a middleware derives `req.vendorId` from the verified token, attaches it to the async context and sets the Prisma/Postgres GUC `app.vendor_id` for the connection (see §3.4). Requests without a tenant claim (platform-admin endpoints, health) run as the `platform` trusted context.
- **Scoping enforcement (the core change):**
  1. A **Prisma client extension** injects `vendorId` into `where` for all tenant-scoped models and rejects raw queries that bypass it.
  2. **Postgres RLS policies** are the backstop — even code that forgets the filter cannot read another vendor's rows.
  3. Per-vendor rate limits on heavy routes (exports, reports) to stop noisy-neighbour degradation.
- **Platform admin endpoints** (`platform` role) intentionally see across vendors: operator dashboards, licence-usage aggregation, tenant management. Small, explicitly tested surface.

### 3.4 Data layer (`postgres`, shared)

**Single Postgres 16 instance** (`postgres_data` volume), single `campaign_buddy` database, schema `public`.

**Data model:**

- New core model `Vendor { id, name, slug, status, brandColor, logoUrl, createdAt, ... }`.
- `Client`, `Staff`, `User` have `vendorId`. All operational tables belong to a vendor transitively through their client, **except** a short denormalisation: high-write identity-keyed tables (`AttendanceRecord`, `SalesRecord`, `TrackingPing`, `DailyStats`, …) also carry `vendorId` directly, because hot-path queries on them must not do extra joins to establish tenancy.
- Global tables (no `vendorId`): `Vendor`, `City`, `Brand` (shared catalogue; revisit per-vendor later if vendors demand category isolation), `Role`, `IssueReport` (tenant-tagged only, operator-owned).
- Vendor choice for every remaining model is table-by-table in a mapping appendix in the migration spec; this doc fixes the *policy*: **every row reachable by a rep's phone must be vendor-scoped by construction.**

**RLS design:**

- `SET LOCAL app.vendor_id = '<id>'` per transaction (Prisma middleware/PgBouncer-compatible); `platform` connections set a bypass admin role.
- Policies: `USING (vendor_id = current_setting('app.vendor_id')::uuid) OR current_setting('app.is_platform')::bool`.
- Enforced with a **drift-checked migration** and a **tenant-leak test suite** (Vitest + supertest): seeded two-vendor dataset, assert every endpoint of vendor A returns zero vendor-B rows — added per AGENTS.md minimal-TDD rule.
- Vendor partitioning (`PARTITION BY HASH (vendor_id)`) deferred until any table exceeds ~50 GB — documented trigger, no premature action.

**Uploads:** existing host mounts (`uploads/items`, `uploads/staff`, `uploads/visit-photos`) become vendor-prefixed paths (`uploads/<vendorSlug>/…`) so a future export/migration per vendor is a directory copy. Enforced in the middleware that writes paths, not merely by convention.

### 3.5 Cross-cutting concerns

- **Licensing / usage tracking** (license-usage-spec): snapshots aggregate per vendor naturally via tenant scoping; vendor-level licence limits enforced in the snapshot job.
- **Issue reporting → GitHub:** `IssueReport` rows tagged with vendor — operator can filter triage by vendor automatically via existing sync flow.
- **Deploy/migrations:** one `prisma migrate deploy` per rollout serves all vendors. The CI job that runs `prisma:seed:demo` as a drift check gains a two-vendor fixture (demo + one synthetic vendor) to keep the leak suite honest locally.
- **Backups:** single shared snapshot/PITR. Documented limitation: a per-vendor point-in-time restore is *not* possible in shared mode — it becomes possible only on the silo tier.
- **Observability:** request logs/metrics tagged with `vendorId` so per-vendor SLOs are measurable in shared mode.

---

## 4. Deployment topology

### 4.1 Today (2 vendors — unchanged compose file)

```yaml
docker-compose.yml (unchanged topology)
  postgres      → one shared DB, vendorId on tenant rows + RLS
  backend       → same image, tenancy in middleware (no new service)
  portal        → same
  app (web)     → same build, same EXPO_PUBLIC_API_BASE_URL
  marketing     → global
  cloudflared   → same ingress hostnames
```

Only changing pieces: the Dockerfile image contents (new middleware/extension/migrations), the Compose `.env` (no new vendor-specific vars needed), and the app/portal images only if branding is wanted. **No hostname, tunnel, or certificate changes.**

### 4.2 Enterprise/silo tier (built only when a paying vendor requires it)

```
tunnel/proxy (existing)
 └─ acme.cb.lk ─► dedicated compose project: backend@acme + postgres@acme (own volume)
     same image as shared stack; only DATABASE_URL + branding env differ
     control plane (master DB + provision script) creates DB → stack → tunnel route
```

- Identical images, no forks; a `provision-vendor.sh` (docker compose project per vendor) keeps silo onboarding to one command when the tier is opened.
- Mobile URL handling mirrors research §3.3a: vendor base URL resolved at login (the `/resolve` discovery endpoint is optional there because this product's reps log into a branded page, not a shared one).

### 4.3 Scaling path (from research §5, in order)

1. Vertical DB → 2. read replicas → 3. stateless backend replicas behind the tunnel/proxy → 4. Redis cache + per-vendor rate limits → 5. background job queue for exports/reports → 6. hash partitioning by `vendorId` → 7. vendor-group sharding only if data volume (not vendor count) demands it.

---

## 5. Security posture summary

| Threat | Control |
|---|---|
| Forgotten `where` vendorId | RLS policies backstop every tenant table |
| Token tampering / vendor forgery | `vendorId` is a server-verified JWT claim, never client input |
| Silo-tier credential compromise | Blast radius bounded to that vendor's stack |
| Heavy-tenant degradation | Per-vendor rate limits + timeout budgets |
| Restore semantics | Shared = platform-wide PITR only; per-vendor restore = silo tier |

---

## 6. Rollout plan (phased, minimal-TDD per AGENTS.md)

1. **Phase 1 — data model.** `Vendor` model + `vendorId` migrations; backfill to a seeded default vendor (red: leak-scoping tests fail against single-vendor data; green: migration + scoping pass).
2. **Phase 2 — token + scoping.** JWT `vendorId` claim, request-context middleware, Prisma extension, RLS policies, two-vendor leak test suite covering every `/v1` and `/api` endpoint.
3. **Phase 3 — product UX.** Vendor resolver at login (email-domain mapping first), vendor branding fields, vendor-aware onboarding flow.
4. **Phase 4 — platform.** Operator cross-vendor dashboard, per-vendor licence limits, observability tags.
5. **Phase 5 — (deferred) silo tier.** Provisioning script + control plane, written only when an enterprise customer signs.

User-guide impact (`marketing/training/`): Phases 3–4 change login/vendor-visible UI → update matching guides in the same PRs as those PRs' UI work.
