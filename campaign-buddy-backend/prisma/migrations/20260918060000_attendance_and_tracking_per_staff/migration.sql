-- Attendance and location trails now belong to WHO checked in.
--
-- Until now an attendance record was unique per (activation, day), so a promoter
-- and the supervisor covering the same activation shared ONE row: the supervisor
-- saw "checked in" when the promoter was, their own check-in was refused, and
-- their check-out closed the promoter's shift. Location pings had no owner at all,
-- so a supervisor's trail showed up as the promoter's.
--
-- Backfill: every existing row is attributed to the activation's own staff member
-- (the promoter, or a supervisor who is the activation's staff). Rows a supervisor
-- had written onto a promoter's shared row cannot be told apart from the promoter's
-- and stay with the promoter — that path only existed for a few days.

-- attendance_records
ALTER TABLE "attendance_records" ADD COLUMN "staffId" TEXT;
UPDATE "attendance_records" r SET "staffId" = a."staffId" FROM "activations" a WHERE a."id" = r."activationId";
ALTER TABLE "attendance_records" ALTER COLUMN "staffId" SET NOT NULL;

DROP INDEX "attendance_records_activationId_date_key";
CREATE UNIQUE INDEX "attendance_records_activationId_staffId_date_key" ON "attendance_records"("activationId", "staffId", "date");
CREATE INDEX "attendance_records_staffId_date_idx" ON "attendance_records"("staffId", "date");
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- tracking_pings
ALTER TABLE "tracking_pings" ADD COLUMN "staffId" TEXT;
UPDATE "tracking_pings" p SET "staffId" = a."staffId" FROM "activations" a WHERE a."id" = p."activationId";
ALTER TABLE "tracking_pings" ALTER COLUMN "staffId" SET NOT NULL;

CREATE INDEX "tracking_pings_staffId_capturedAt_idx" ON "tracking_pings"("staffId", "capturedAt");
ALTER TABLE "tracking_pings" ADD CONSTRAINT "tracking_pings_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
