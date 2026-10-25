# ADR-0006: Who deleted what is an append-only event table; soft-deleted data is kept, never purged

- **Status:** Accepted (owner decisions in chat, 2026-10-26, for #113)
- **Date:** 2026-10-26
- **Decided by:** owner (proposed by product-owner and technical-architect agents)

## Context
Deletes are soft (ADR-0002) and now reversible (#110, #111, #112), but nothing recorded *who* deleted or restored a record, restoring overwrites the marker, and staff are only `status: inactive` with no timestamp. A proposed 90-day purge of soft-deleted rows "with no dependants" would not help privacy (almost every staff member has attendance rows, so staff would never be reached) and would only add deletion risk for rows that hold no personal data.

## Decision
1. Every successful soft delete, restore and staff reactivate appends one row to `deletion_events` (`entityType`, `entityId`, `campaignId?`, `action` delete|restore, `userId`, `at`). The entity tables stay the source of truth for *current* state; the event table answers "by whom, when". It is written by one admin-router middleware (`recordDeletionEvents`) from the URL, so a handler cannot forget it, and a failure to record never fails the user's action. No foreign keys: the trail must outlive any row it names.
2. **No purge job.** Soft-deleted business records are kept. Sales, attendance, sales-field and tracking history is never hard-deleted.
3. Staff personal data (NIC, bank, address, photo) is handled by **redaction** after a retention period decided by the owner/legal, not by deleting rows. Tracked in #137.

## Consequences
- "Recently deleted" (`GET /deleted`, `GET /campaigns/:id/deleted`) lists current soft-deleted rows and joins the latest delete event for "deleted by"; rows deleted before this change show no deleter.
- Deleting a campaign access grant (a hard delete) and the mobile-side un-archive of a sales record are not recorded yet; a later audit-log story (#138) extends the same table.
- Storage grows without bound but slowly (small sets per agency). Revisit if a deployment's `deletion_events` or soft-deleted tables get large.

## Alternatives considered
- `deletedByUserId` columns on ~15 tables: bigger migration, loses who restored, needs extra staff columns.
- 90-day purge job: risks `data_loss_offline`, does not reach staff personal data.
