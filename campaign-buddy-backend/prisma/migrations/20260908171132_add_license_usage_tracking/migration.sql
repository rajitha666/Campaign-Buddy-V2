-- CreateEnum
CREATE TYPE "LicenseUsagePeriod" AS ENUM ('week', 'month');

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "licenseAdminCap" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "licensePromoterCap" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "licenseSponsorCap" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "licenseSupervisorCap" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "licenseWarnThresholdPct" INTEGER;

-- CreateTable
CREATE TABLE "campaign_license_usage_snapshots" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "period" "LicenseUsagePeriod" NOT NULL,
    "periodStart" DATE NOT NULL,
    "promoterUsed" INTEGER NOT NULL DEFAULT 0,
    "supervisorUsed" INTEGER NOT NULL DEFAULT 0,
    "adminUsed" INTEGER NOT NULL DEFAULT 0,
    "sponsorUsed" INTEGER NOT NULL DEFAULT 0,
    "promoterCap" INTEGER NOT NULL DEFAULT 0,
    "supervisorCap" INTEGER NOT NULL DEFAULT 0,
    "adminCap" INTEGER NOT NULL DEFAULT 0,
    "sponsorCap" INTEGER NOT NULL DEFAULT 0,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_license_usage_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaign_license_usage_snapshots_campaignId_idx" ON "campaign_license_usage_snapshots"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_license_usage_snapshots_campaignId_period_periodSt_key" ON "campaign_license_usage_snapshots"("campaignId", "period", "periodStart");

-- AddForeignKey
ALTER TABLE "campaign_license_usage_snapshots" ADD CONSTRAINT "campaign_license_usage_snapshots_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
