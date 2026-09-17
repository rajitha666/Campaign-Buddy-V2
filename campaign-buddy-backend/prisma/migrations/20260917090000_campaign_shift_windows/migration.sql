-- Campaign-level shift window (default 09:00-18:00 local), editable per
-- campaign; Activation-level shift override switches from a fixed DateTime to
-- minutes-since-midnight so it applies correctly on every day of a multi-day
-- activation (a stored DateTime compared against "now" at check-in time only
-- ever matched the exact calendar day it was originally set on).
--
-- Existing Activation.shiftStart/shiftEnd values are backfilled into the new
-- columns before the old ones are dropped, so no shift already configured for
-- a live campaign is lost. New Campaign columns get NOT NULL defaults so
-- every existing campaign keeps its current (previously hardcoded 09:00-17:00
-- ideal-window) behaviour, now sourced from a per-campaign, admin-editable
-- default of 09:00-18:00 instead.

-- Campaign: new default shift window.
ALTER TABLE "campaigns" ADD COLUMN "shiftStartMinutes" INTEGER NOT NULL DEFAULT 540;
ALTER TABLE "campaigns" ADD COLUMN "shiftEndMinutes" INTEGER NOT NULL DEFAULT 1080;

-- Activation: add the new nullable override columns first...
ALTER TABLE "activations" ADD COLUMN "shiftStartMinutes" INTEGER;
ALTER TABLE "activations" ADD COLUMN "shiftEndMinutes" INTEGER;

-- ...backfill from the old DateTime columns. Each is a UTC instant on a fixed
-- +05:30 Colombo offset (no DST), so wall-clock minutes = UTC minutes + 330.
UPDATE "activations"
SET "shiftStartMinutes" = (((EXTRACT(HOUR FROM "shiftStart") * 60 + EXTRACT(MINUTE FROM "shiftStart"))::int + 330) % 1440)
WHERE "shiftStart" IS NOT NULL;

UPDATE "activations"
SET "shiftEndMinutes" = (((EXTRACT(HOUR FROM "shiftEnd") * 60 + EXTRACT(MINUTE FROM "shiftEnd"))::int + 330) % 1440)
WHERE "shiftEnd" IS NOT NULL;

-- ...then drop the old columns.
ALTER TABLE "activations" DROP COLUMN "shiftStart";
ALTER TABLE "activations" DROP COLUMN "shiftEnd";
