# ADR-0001: One isolated deployment per agency; nothing shared across agencies

- **Status:** Accepted (recorded retrospectively 2026-10-25 from `docs/product-charter.md` §2, decided by the owner 2026-10-02 as D1/D2)
- **Decided by:** owner

## Context
Campaign Buddy is multi-agency SaaS. Data isolation between agencies is a non-negotiable (charter §4.1-2). A shared database would need every query to carry an agency filter.

## Decision
Each agency runs its own full stack (its own compose instance, PostgreSQL and uploads). Cities, outlets, retail chains and the item catalog are each agency's own data. Do not add an `agencyId`/`organisationId`/`tenantId` column spanning agencies in one database; propose it to the owner first.

## Consequences
Isolation is a property of infrastructure, not of every query. The cost moves to provisioning and upgrades (N deployments): keep `dev.sh`, `deploy-prod.sh` and `docker-compose*.yml` scripted. Isolation risk concentrates in anything *shared* — this repo's own agents/tooling, MCP, any future central service. Revisit if an agency must see another's data by design, or deployments outgrow scripted provisioning (owner decision).

## Alternatives considered
Shared multi-tenant database with `agencyId` on every table: rejected as costlier to get right at this scale and a standing leak risk.
