-- Configurable per-campaign designation label (client doc F) — e.g. "Beauty
-- Advisor" instead of "Promoter". Null means "use the default label"; every
-- existing campaign keeps showing "Promoter" until an admin sets one.
ALTER TABLE "campaigns" ADD COLUMN "promoterLabel" TEXT;
