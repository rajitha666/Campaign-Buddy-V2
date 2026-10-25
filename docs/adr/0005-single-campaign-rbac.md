# ADR-0005: One RBAC mechanism — role + campaign grant + outlet scope

- **Status:** Accepted as implemented (recorded retrospectively 2026-10-25 from `campaign-buddy-backend/src/middleware/campaignAccess.ts`; Backend Spec v3 §3.3)
- **Decided by:** owner (as built)

## Context
Admins, supervisors and sponsors (clients) must see different slices of the same data, and read-only roles must stay read-only whatever the UI shows.

## Decision
Every route under `/admin/v1/campaigns/:campaignId/*` lists `requireCampaignAccess` itself (per route): `adm` bypasses grants; others resolve a `CampaignAccessGrant` (scope `all` or an outlet list). Writes are `requireRole("adm","usr")` (55 routes) or `adm` only (five routes, the city routes). Outlet-touching routes call `outletIdsAllowed` / `assertOutletAllowed`. The portal maps roles to personas (`adm|usr|super` → admin, `supervisor`, `sponsor|client`) for display only; the server enforces.

## Consequences
One mechanism to reason about, but it is applied per route, so a forgotten `requireRole`/`requireCampaignAccess` is not caught automatically (no lint yet). New routes must declare role, campaign access and outlet scope and be tested for 403 and cross-campaign 404. Removing a grant is currently a hard delete (#111).

## Alternatives considered
A single router-level mount for all `/campaigns/:campaignId/*` routes (so a route cannot forget the check): not what was built — a candidate improvement; today each route lists the middleware itself.
