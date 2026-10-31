# ADR-0002: Deletes are soft; every read filters the marker

- **Status:** Accepted as implemented (recorded retrospectively 2026-10-25 from the code; owner to confirm). Gaps tracked in #110, #111, #127.
- **Decided by:** owner (as built)

## Context
Staff, outlets, campaigns and their history feed reports and the client's trust in the numbers. Hard deletes lose history; several history tables cascade on parent delete.

## Decision
`DELETE` on an entity sets a marker instead of removing the row: `deletedAt` (Client, Brand, Item, City, Outlet, DistributorPoint, Campaign, Activation, SupervisorTask, SupervisorRoute), `archivedAt` (SalesRecord, SalesFieldDefinition), `status: inactive` (Staff). Responses include `softDeleted: true`. **Every read of such a model filters the marker or checks it explicitly.** Restore is `POST …/:id/restore` (404 when not deleted); only sales records have it today. Unique codes stay unique including deleted rows.

## Consequences
History and reports stay intact; deleted records can be brought back. Reads can leak deleted rows if a filter is forgotten (30 candidates found by `scripts/agent/soft-delete-lint.mjs`, bug #127). Remaining hard deletes (CampaignItem, ActivationItem, CampaignAccessGrant) and `ON DELETE CASCADE` on history tables contradict the convention (#111). A "recently deleted" view and a retention policy are open (#113, charter G7).

## Alternatives considered
Hard delete with an audit table: rejected (loses relations, harder restore). Per-entity ad-hoc flags: rejected in favour of the two markers above.
