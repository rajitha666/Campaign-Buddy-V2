-- Supervisor outlet checklist on mobile: supervisors score the promoter (1-5),
-- leave feedback and capture outlet-setup photos against each campaign task.

-- AlterEnum
ALTER TYPE "SupervisorTaskType" ADD VALUE 'photo';

-- AlterTable
ALTER TABLE "supervisor_tasks" ADD COLUMN "imageCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "supervisor_task_responses" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "activationId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "supervisorStaffId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "rating" INTEGER,
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supervisor_task_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supervisor_task_photos" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supervisor_task_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supervisor_task_responses_activationId_date_idx" ON "supervisor_task_responses"("activationId", "date");

-- CreateIndex
CREATE INDEX "supervisor_task_responses_outletId_date_idx" ON "supervisor_task_responses"("outletId", "date");

-- CreateIndex
CREATE INDEX "supervisor_task_responses_supervisorStaffId_idx" ON "supervisor_task_responses"("supervisorStaffId");

-- CreateIndex
CREATE UNIQUE INDEX "supervisor_task_responses_taskId_activationId_date_key" ON "supervisor_task_responses"("taskId", "activationId", "date");

-- CreateIndex
CREATE INDEX "supervisor_task_photos_responseId_idx" ON "supervisor_task_photos"("responseId");

-- AddForeignKey
ALTER TABLE "supervisor_task_responses" ADD CONSTRAINT "supervisor_task_responses_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "supervisor_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisor_task_responses" ADD CONSTRAINT "supervisor_task_responses_activationId_fkey" FOREIGN KEY ("activationId") REFERENCES "activations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisor_task_responses" ADD CONSTRAINT "supervisor_task_responses_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisor_task_responses" ADD CONSTRAINT "supervisor_task_responses_supervisorStaffId_fkey" FOREIGN KEY ("supervisorStaffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisor_task_photos" ADD CONSTRAINT "supervisor_task_photos_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "supervisor_task_responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
