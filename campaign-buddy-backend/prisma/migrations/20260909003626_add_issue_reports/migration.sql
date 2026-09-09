-- CreateEnum
CREATE TYPE "IssueReportCategory" AS ENUM ('bug', 'enhancement', 'question');

-- CreateEnum
CREATE TYPE "IssueReportSeverity" AS ENUM ('low', 'normal', 'high', 'critical');

-- CreateEnum
CREATE TYPE "IssueReportSyncStatus" AS ENUM ('pending', 'synced', 'failed');

-- CreateTable
CREATE TABLE "issue_reports" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" "IssueReportCategory" NOT NULL DEFAULT 'bug',
    "severity" "IssueReportSeverity",
    "context" JSONB,
    "reporterUserId" TEXT NOT NULL,
    "reporterName" TEXT NOT NULL,
    "syncStatus" "IssueReportSyncStatus" NOT NULL DEFAULT 'pending',
    "githubIssueNumber" INTEGER,
    "githubIssueUrl" TEXT,
    "syncError" TEXT,
    "syncAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "issue_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "issue_reports_syncStatus_idx" ON "issue_reports"("syncStatus");

-- CreateIndex
CREATE INDEX "issue_reports_reporterUserId_idx" ON "issue_reports"("reporterUserId");

-- AddForeignKey
ALTER TABLE "issue_reports" ADD CONSTRAINT "issue_reports_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
