# Campaign Buddy — Architecture Guide

**Audience:** the Technical Architect role (`.claude/agents/technical-architect.md`) and any builder. It records **how the system is built and the rules a change must respect**, so reviews check against a stated standard. It is not a product spec (`docs/backend-spec.md`, `docs/api-spec.md`) and not the charter (`docs/product-charter.md`, which decides *what* we build and what blocks).

Verified against the code on 2026-10-25. Statements cite files; if code and this guide disagree, **the code is the truth — fix the guide** and tell the owner. Lasting decisions live in `docs/adr/`.

## 1. System map

One deployment per agency (charter §2, ADR-0001): each agency runs its own stack, database and uploads. Nothing is shared across agencies.

| Component | Path | Tech | Role |
|---|---|---|---|
| Backend API | `campaign-buddy-backend/` | Node/Express, TypeScript, Prisma, PostgreSQL | One process serving two surfaces: `/v1` (mobile) and `/admin/v1` (portal, MCP) — `src/app.ts` mounts both behind `noStore`. 31 Prisma models, 20 migrations |
| Portal (CB Office) | `campaign-buddy-portal/` | React + Vite (JS/JSX) | Admin, supervisor and sponsor web UI. Served same-origin with `/training/` guides |
| Mobile app (CB Mobile) | `campaign-buddy-app/` | React Native / Expo (TypeScript) | Promoter and supervisor field app; offline-first (`src/offline/`) |
| MCP server | `campaign-buddy-mcp/` | TypeScript | Read tools + two-step confirmed write tools over `/admin/v1`; `coverage.json` gate in CI |
| Agent tooling | `scripts/agent/`, `product-owner-agent/`, `triage-agent/`, `.claude/` | Node | Repo's own product-building tools (the only place that can span agencies — treat as shared infrastructure) |
| Delivery | `docker-compose*.yml`, `dev.sh`, `deploy-prod.sh`, `INSTALLATION_GUIDE.md` | Docker | Per-agency provisioning; keep it scripted, not manual (charter §2) |

Backend layout (`campaign-buddy-backend/src/`): `modules/admin/*.routes.ts` and `modules/mobile/*.routes.ts` (routes), `middleware/` (`campaignAccess`, `userAuth`, `staffAuth`, `validate`, `errorHandler`), `utils/` (dates, clientTime, apiResponse, attendanceWindow…), `jobs/` (cron), `schemas.ts` (request validation).

Background jobs (`src/jobs/`, cron via `node-cron`): `autoCheckout` (closes open shifts at end of day), `licenseSnapshot` (per-campaign seat metering), `issueSync` (hourly GitHub issue sync).

## 2. Access control (the one RBAC mechanism)

- Portal roles map to personas in `portal/src/context/AuthContext.jsx`: `adm`/`usr`/`super` → admin, `supervisor`, `sponsor`/`client`. **Writes are `requireRole("adm","usr")`** (55 routes); `adm` alone for five (the city routes). Read-only roles are meant to be enforced **server-side**, not by the UI — but nothing checks automatically that every write route carries `requireRole` (listed in the debt register).
- Every route under `/admin/v1/campaigns/:campaignId/*` lists **`requireCampaignAccess`** itself, per route (`middleware/campaignAccess.ts`; e.g. `activations.routes.ts`): `adm` bypasses grants; everyone else resolves a `CampaignAccessGrant` (scope `all` or an outlet list). Routes touching outlets also call the outlet guard (`outletIdsAllowed` / `assertOutletAllowed`).
- **Rule:** a new route is not done until its role, campaign access and outlet scope are explicit and tested (including a 403 for a read-only token and a cross-campaign 404).
- Mobile uses staff tokens (`staffAuth`); promoters/supervisors act only on their own assignments.

## 3. Data conventions

**Soft delete (ADR-0002).** Deleting rarely removes a row: `DELETE` sets `deletedAt` (Client, Brand, Item, City, Outlet, DistributorPoint, Campaign, Activation, SupervisorTask, SupervisorRoute), `archivedAt` (SalesRecord, SalesFieldDefinition) or `status: inactive` (Staff). Every entity delete (and restore) response carries `softDeleted: true|false` (14 occurrences, all in `modules/admin`).
- **Every read of a soft-deletable model must filter the marker** (or check it explicitly right after). `node scripts/agent/soft-delete-lint.mjs` lists reads that don't; 30 were found on 2026-10-25 (tracked in bug #127).
- **Restore** exists only for sales records today; the pattern to copy is `POST …/:id/restore` (404 if not deleted). Restore endpoints for the rest are story #110.
- **Hard deletes remain** for `CampaignItem`, `ActivationItem` and `CampaignAccessGrant` (story #111). Many tables use `ON DELETE CASCADE` — at least `sales_records`, `attendance_records`, `sales_field_values`, `sales_summaries`, `daily_stats`, `tracking_pings`, `leave_requests`, `supervisor_task_responses`, `supervisor_task_photos`, `activation_targets`, plus parent chains (Client→Brand→Item, Campaign→Activation, and Staff→AttendanceRecord/TrackingPing/LeaveRequest; not exhaustive: grep `onDelete: Cascade` in `schema.prisma`). **A hard delete of a parent can erase recorded history** — notably a hard delete of Staff, which is why staff are only deactivated. Treat any new `DELETE`/cascade as a data-loss review item.
- Unique codes (`outletNo`, `campaignNo`, `employeeId`, `mobileUsername`, `[brandId, sku]`) are unique **including deleted rows**, so a code can't be reused while its record is deleted.
- Some uniques are **offline-replay idempotency keys**: `[activationId, staffId, date, visitNo]` on attendance and the per-day uniques on `DailyStats`, `SalesSummary` and `SalesRecord` make a replayed queued write an update, not a duplicate. Don't drop or loosen them.

**Dates and time (ADR-0004).** `@db.Date` columns are keyed by the **UTC calendar date at UTC-midnight**; every filter must use a UTC-midnight `Date` (`utils/dates.ts` `dayDate()`). The business day is **Asia/Colombo** (UTC+5:30, no DST): "today" is `colomboYmd()` / `dayDate()`, never `new Date().toISOString()` (which is the UTC day and is wrong 00:00–05:30 Colombo). Portal equivalents: `lib/colomboDay.js`. `Campaign.timezone` exists (default `Asia/Colombo`) but most code still hard-codes the Colombo helpers. New `LKR` / `Asia/Colombo` / `+94` literals are discouraged (charter G5) — prefer the campaign's own settings.

**Responses and paging.** Envelope helpers in `utils/apiResponse.ts` (`ok`, `okList`); lists are paginated (`paginate(req)`); never add an unbounded list endpoint.

**Migrations.** Additive and safe on a populated database: new columns nullable or with a default; no `DROP`/`RENAME` without an expand/contract plan (shipped apps replay old payloads — §4). Run `node scripts/agent/migration-lint.mjs --merge <sha>` (exit 1 on danger). Seed data: `prisma/seed.ts` (base) and `prisma/demo-seed.ts` (demo); CI has a **demo-data drift check**.

## 4. Offline-first and shipped clients

- The mobile app queues field actions while offline (`campaign-buddy-app/src/offline/queue.ts`) and replays them in a fixed order: `checkIn → (stats, salesSummary, productStock) → salesConfirm → checkOut`; `classifyError` (`offline/networkError.ts`) sorts failures: no response → network and 408/429/5xx → retryable (kept queued, backoff, max 8 attempts); **401 → auth (the queue waits for the session to refresh; it is not a verdict on the edit)**; any other status → permanent (the server refused it).
- **`capturedAt` trust rule (ADR-0003, `utils/clientTime.ts`):** the app sends a client time **only** for queued actions; the server trusts it only if valid, not in the future (2-min skew allowed) and on the **same Colombo day** as now; otherwise it uses server time. Sales writes (stats, product stock, sales summary) pass `requireOpenShift` (`utils/salesGuards.ts`): a shift that closed meanwhile (the rep's check-out or the end-of-day auto-checkout) still accepts a queued write whose `capturedAt` falls inside [check-in, check-out]; otherwise 422 `NOT_CHECKED_IN`.
- **Old app versions replay old payloads days later**, so the server must keep accepting them. There is **no client-version gate yet (charter G2)** — an API request/response change needs an explicit compatibility path (additive fields, tolerate old shapes) and a note in the PR.
- Native modules (AsyncStorage, NetInfo, expo-background-task, expo-task-manager) mean an app change that adds one needs a native rebuild and a device-test entry (`docs/physical-device-tests.md`).

## 5. Performance and scale budgets

Target: 5–10 deployments, ~2,000 promoters total, one VPS + one PostgreSQL per agency (charter §3). Reject: unbounded list endpoints, per-request table scans, missing indexes on filtered columns, loading every row to total it client-side (the dashboard does this today — story #114), files on a single disk with no backup (uploads, G4). Don't ask for queues, sharding or Kubernetes without a measured trigger.

Mobile: small payloads, compressed photos, few dependencies (charter §4.1-3).

## 6. Security and privacy checklist

- Authz per §2 on every route; validate input with `validate()` + `schemas.ts`.
- Location trails, national IDs, bank details and photos: stated purpose, minimum roles, retention policy (charter §4.1-4; policy is still undocumented — G7).
- No secrets, logins or seed credentials in the repo, docs, issues or PRs (`AGENTS.md`). `cors()` is open and there is no rate limiting / security headers yet (G3, advisory).
- Uploads are served statically from `/uploads` (G4).
- The MCP server exposes `/admin/v1` through the same auth; its write tools are two-step with human approval.

## 7. Testing and CI

- Minimal TDD for every change (`AGENTS.md`). Suites: backend (vitest + supertest, needs a `*_test` DB), portal (vitest), app (vitest + typecheck), MCP (vitest), PO agent (node:test), agent toolkit (`node --test scripts/agent/test`).
- CI (`.github/workflows/ci.yml`): Backend (+ demo-data drift check), Portal, Mobile app, MCP (+ coverage gate), Product Owner agent (unit), **Portal e2e** and **Mobile app e2e** (Playwright, seeded stack), Training docs reminder. The `review` check (PO bot) needs secrets and currently fails on every PR (issue #100).
- Local verification should use an isolated, freshly seeded stack (`node scripts/agent/fresh-stack.mjs up`) — dev databases drift and have caused false failures.
- A new backend route needs: tests (role, scope, 404/403), `docs/api-spec.md`, and `campaign-buddy-mcp/coverage.json`.

## 8. Operations (per agency)

`dev.sh`, `deploy-prod.sh`, `docker-compose*.yml`, `INSTALLATION_GUIDE.md` are the canonical way to stand up and upgrade a deployment. Backups, monitoring and restore drills are **unverified (G9)** — ask for evidence, don't assume. Rollback of a bad migration has no documented path; require one for any non-additive migration.

## 9. Technical-debt register

| Item | Where | Tracked |
|---|---|---|
| Hard deletes (campaign items, activation items, access grants) and history cascades | §3 | #111 |
| No restore endpoints for soft-deleted records | §3 | #110 |
| 30 unfiltered reads of soft-deletable models | §3 | #127 |
| No client-version gate | §4 | charter G2 |
| No API hardening layer | §6 | charter G3 |
| Uploads on local disk, no backup | §6 | charter G4 |
| Locale literals (~30 files) | §3 | charter G5 |
| Dashboard totals computed client-side from all rows | §5 | #114 |
| Privacy lifecycle (retention/deletion/audit) undocumented | §6 | charter G7 |
| No automated check that every write route carries `requireRole` / campaign access | §2 | none yet |
| Backups/monitoring/restore drills unverified | §8 | charter G9 |

## 10. Decision records

`docs/adr/` — one short file per lasting technical decision (`0000-template.md`). ADR-0001–0005 were **recorded retrospectively on 2026-10-25 from the charter and the code**; the owner should confirm them. Add a new ADR when a change introduces or reverses a lasting rule; the Technical Architect proposes it, the owner accepts it.
