-- usr-role soft delete across record areas (#102): DELETE now marks rows with
-- deletedAt instead of removing them. Adds the column to every model that has
-- a delete endpoint, and replaces the outlets unique constraint with a partial
-- index so a soft-deleted outlet's outletNo can be reused (same pattern as the
-- items soft-delete migration 20260916130608).
ALTER TABLE "clients"             ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "brands"              ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "cities"              ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "outlets"             ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "distributor_points"  ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "campaigns"           ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "activations"         ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "supervisor_tasks"    ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "supervisor_routes"   ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Outlet numbers and campaign numbers become reusable once soft-deleted
-- (#102, items precedent).
DROP INDEX "outlets_outletNo_key";
CREATE UNIQUE INDEX "outlets_outletNo_key" ON "outlets"("outletNo") WHERE "deletedAt" IS NULL;

DROP INDEX "campaigns_campaignNo_key";
CREATE UNIQUE INDEX "campaigns_campaignNo_key" ON "campaigns"("campaignNo") WHERE "deletedAt" IS NULL;
