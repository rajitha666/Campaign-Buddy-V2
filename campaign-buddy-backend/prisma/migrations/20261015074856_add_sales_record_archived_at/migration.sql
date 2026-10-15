-- Head-office soft delete (sales-archive-spec.md): an archived row stays in the
-- DB but is excluded from every calculation/report. NULL = live. The
-- (activationItemId, date) unique key is untouched — a promoter re-entering
-- stock for the same product/day updates this same row and unarchives it.
ALTER TABLE "sales_records" ADD COLUMN "archivedAt" TIMESTAMP(3);
