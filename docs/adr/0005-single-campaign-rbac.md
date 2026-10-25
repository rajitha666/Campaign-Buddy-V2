# ADR-0005: One RBAC mechanism — role + campaign grant + outlet scope

- **Status:** Accepted as implemented (recorded retrospectively 2026-10-25 from `campaign-buddy-backend/src/middleware/campaignAccess.ts`; Backend Spec v3 §3.3)
- **Decided by:** owner (as built)

## Context
Admins, supervisors and sponsors (clients) must see different slices of the same data, and read-only roles must stay read-only whatever the UI shows.

## Decision
Every `/admin/v1/campaigns/:campaignId/*` router mounts `requireCampaignAccess`: `adm` bypasses grants; others resolve a `CampaignAccessGrant` (scope `all` or an outlet list). Writes are `requireRole("adm","usr")` (55 routes) or `adm` only. Outlet-touching routes call `outletIdsAllowed` / `assertOutletAllowed`. The portal maps roles to personas (`adm|usr|super` → admin, `supervisor`, `sponsor|client`) for display only; the server enforces.

## Consequences
One place to reason about access; new routes must declare role, campaign access and outlet scope and be tested for 403 and cross-campaign 404. Removing a grant is currently a hard delete (#111).

## Alternatives considered
Per-route ad-hoc checks: rejected (drift and gaps).
