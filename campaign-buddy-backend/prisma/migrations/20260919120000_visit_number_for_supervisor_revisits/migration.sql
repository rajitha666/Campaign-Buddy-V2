-- A supervisor can visit the same outlet several times in a day. Each check-in
-- is its own "visit" (visitNo 1, 2, ...) with its own attendance row and its own
-- checklist answers. Existing rows are all visit 1, so nothing changes for them.

-- attendance_records
ALTER TABLE "attendance_records" ADD COLUMN "visitNo" INTEGER NOT NULL DEFAULT 1;
DROP INDEX "attendance_records_activationId_staffId_date_key";
CREATE UNIQUE INDEX "attendance_records_activationId_staffId_date_visitNo_key" ON "attendance_records"("activationId", "staffId", "date", "visitNo");

-- supervisor_task_responses
ALTER TABLE "supervisor_task_responses" ADD COLUMN "visitNo" INTEGER NOT NULL DEFAULT 1;
DROP INDEX "supervisor_task_responses_taskId_activationId_date_key";
CREATE UNIQUE INDEX "supervisor_task_responses_taskId_activationId_date_visitNo_key" ON "supervisor_task_responses"("taskId", "activationId", "date", "visitNo");
