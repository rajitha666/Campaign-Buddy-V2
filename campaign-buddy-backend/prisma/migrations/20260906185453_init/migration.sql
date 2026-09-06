-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('upcoming', 'active', 'ended');

-- CreateEnum
CREATE TYPE "StaffType" AS ENUM ('promoter', 'supervisor');

-- CreateEnum
CREATE TYPE "StaffStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "TargetType" AS ENUM ('item_wise', 'brand_wise');

-- CreateEnum
CREATE TYPE "TargetCategorization" AS ENUM ('daily', 'monthly');

-- CreateEnum
CREATE TYPE "TargetUnit" AS ENUM ('unit_wise', 'sales_wise');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('on_time', 'late', 'leave', 'absent', 'pending');

-- CreateEnum
CREATE TYPE "AppState" AS ENUM ('foreground', 'background');

-- CreateEnum
CREATE TYPE "LeaveReason" AS ENUM ('sick_leave', 'annual_leave', 'personal', 'other');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('pending', 'approved', 'declined');

-- CreateEnum
CREATE TYPE "SupervisorTaskType" AS ENUM ('range', 'feedback');

-- CreateEnum
CREATE TYPE "OutletScopeType" AS ENUM ('all', 'subset');

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "contactNumber" TEXT,
    "email" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brands" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "reorderLevel" INTEGER NOT NULL DEFAULT 0,
    "imageUrl" TEXT,
    "description" TEXT,
    "attributes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "supplierName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "district" TEXT NOT NULL,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outlets" (
    "id" TEXT NOT NULL,
    "outletNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactPerson" TEXT,
    "address" TEXT,
    "cityId" TEXT NOT NULL,
    "phone" TEXT,
    "mobile" TEXT,
    "fax" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "geofenceRadiusMeters" INTEGER NOT NULL DEFAULT 150,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outlets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distributor_points" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "address" TEXT,
    "cityId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "distributor_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "userType" "StaffType" NOT NULL,
    "mobileUsername" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "phone" TEXT,
    "cityId" TEXT,
    "status" "StaffStatus" NOT NULL DEFAULT 'active',
    "reportsToStaffId" TEXT,
    "linkedUserId" TEXT,
    "nic" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "gender" TEXT,
    "permanentAddress" TEXT,
    "currentAddress" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "bankAccountName" TEXT,
    "bankName" TEXT,
    "bankAccountNumber" TEXT,
    "bankBranch" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_refresh_tokens" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "staff_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "campaignNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "description" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'upcoming',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Colombo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_items" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "supervisorStaffId" TEXT,
    "distributorPointId" TEXT,
    "dateFrom" TIMESTAMP(3) NOT NULL,
    "dateTo" TIMESTAMP(3) NOT NULL,
    "targetType" "TargetType" NOT NULL DEFAULT 'item_wise',
    "targetCategorization" "TargetCategorization" NOT NULL DEFAULT 'daily',
    "targetUnit" "TargetUnit" NOT NULL DEFAULT 'unit_wise',
    "shiftStart" TIMESTAMP(3),
    "shiftEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activation_items" (
    "id" TEXT NOT NULL,
    "activationId" TEXT NOT NULL,
    "campaignItemId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activation_targets" (
    "id" TEXT NOT NULL,
    "activationId" TEXT NOT NULL,
    "dateFrom" TIMESTAMP(3) NOT NULL,
    "dateTo" TIMESTAMP(3) NOT NULL,
    "repeat" BOOLEAN NOT NULL DEFAULT false,
    "targetItemId" TEXT NOT NULL,
    "targetValue" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activation_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" TEXT NOT NULL,
    "activationId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "checkInAt" TIMESTAMP(3),
    "checkInLat" DOUBLE PRECISION,
    "checkInLng" DOUBLE PRECISION,
    "checkInLocationVerified" BOOLEAN NOT NULL DEFAULT false,
    "checkOutAt" TIMESTAMP(3),
    "checkOutLat" DOUBLE PRECISION,
    "checkOutLng" DOUBLE PRECISION,
    "salesSummaryConfirmedAtCheckout" BOOLEAN NOT NULL DEFAULT false,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'pending',
    "leaveRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_records" (
    "id" TEXT NOT NULL,
    "activationItemId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "openingStock" INTEGER NOT NULL DEFAULT 0,
    "soldToday" INTEGER NOT NULL DEFAULT 0,
    "otherInterestedCustomers" INTEGER NOT NULL DEFAULT 0,
    "reorderFlag" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_stats" (
    "id" TEXT NOT NULL,
    "activationId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "footFall" INTEGER NOT NULL DEFAULT 0,
    "approached" INTEGER NOT NULL DEFAULT 0,
    "converted" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_summaries" (
    "id" TEXT NOT NULL,
    "activationId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "remarks" TEXT,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking_pings" (
    "id" TEXT NOT NULL,
    "activationId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracyMeters" DOUBLE PRECISION,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appState" "AppState" NOT NULL DEFAULT 'foreground',
    "batteryPercent" INTEGER,

    CONSTRAINT "tracking_pings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "fromDate" DATE NOT NULL,
    "toDate" DATE NOT NULL,
    "reason" "LeaveReason" NOT NULL,
    "note" TEXT,
    "status" "LeaveStatus" NOT NULL DEFAULT 'pending',
    "approverId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supervisor_tasks" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "taskType" "SupervisorTaskType" NOT NULL,
    "task" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supervisor_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supervisor_routes" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "supervisorStaffId" TEXT NOT NULL,
    "outletIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dateFrom" DATE NOT NULL,
    "dateTo" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supervisor_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "modules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "functionality" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "defaultUrl" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "roleId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_access_grants" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "scopeType" "OutletScopeType" NOT NULL DEFAULT 'all',
    "outletIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_access_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "brands_clientId_idx" ON "brands"("clientId");

-- CreateIndex
CREATE INDEX "items_brandId_idx" ON "items"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "items_brandId_sku_key" ON "items"("brandId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "outlets_outletNo_key" ON "outlets"("outletNo");

-- CreateIndex
CREATE INDEX "outlets_cityId_idx" ON "outlets"("cityId");

-- CreateIndex
CREATE INDEX "distributor_points_cityId_idx" ON "distributor_points"("cityId");

-- CreateIndex
CREATE INDEX "distributor_points_clientId_idx" ON "distributor_points"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_employeeId_key" ON "staff"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_mobileUsername_key" ON "staff"("mobileUsername");

-- CreateIndex
CREATE UNIQUE INDEX "staff_linkedUserId_key" ON "staff"("linkedUserId");

-- CreateIndex
CREATE INDEX "staff_cityId_idx" ON "staff"("cityId");

-- CreateIndex
CREATE INDEX "staff_reportsToStaffId_idx" ON "staff"("reportsToStaffId");

-- CreateIndex
CREATE INDEX "staff_refresh_tokens_staffId_idx" ON "staff_refresh_tokens"("staffId");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_campaignNo_key" ON "campaigns"("campaignNo");

-- CreateIndex
CREATE INDEX "campaigns_clientId_idx" ON "campaigns"("clientId");

-- CreateIndex
CREATE INDEX "campaign_items_campaignId_idx" ON "campaign_items"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_items_campaignId_itemId_key" ON "campaign_items"("campaignId", "itemId");

-- CreateIndex
CREATE INDEX "activations_campaignId_idx" ON "activations"("campaignId");

-- CreateIndex
CREATE INDEX "activations_outletId_idx" ON "activations"("outletId");

-- CreateIndex
CREATE INDEX "activations_staffId_idx" ON "activations"("staffId");

-- CreateIndex
CREATE INDEX "activations_supervisorStaffId_idx" ON "activations"("supervisorStaffId");

-- CreateIndex
CREATE INDEX "activation_items_activationId_idx" ON "activation_items"("activationId");

-- CreateIndex
CREATE UNIQUE INDEX "activation_items_activationId_campaignItemId_key" ON "activation_items"("activationId", "campaignItemId");

-- CreateIndex
CREATE INDEX "activation_targets_activationId_idx" ON "activation_targets"("activationId");

-- CreateIndex
CREATE INDEX "attendance_records_activationId_idx" ON "attendance_records"("activationId");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_activationId_date_key" ON "attendance_records"("activationId", "date");

-- CreateIndex
CREATE INDEX "sales_records_activationItemId_idx" ON "sales_records"("activationItemId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_records_activationItemId_date_key" ON "sales_records"("activationItemId", "date");

-- CreateIndex
CREATE INDEX "daily_stats_activationId_idx" ON "daily_stats"("activationId");

-- CreateIndex
CREATE UNIQUE INDEX "daily_stats_activationId_date_key" ON "daily_stats"("activationId", "date");

-- CreateIndex
CREATE INDEX "sales_summaries_activationId_idx" ON "sales_summaries"("activationId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_summaries_activationId_date_key" ON "sales_summaries"("activationId", "date");

-- CreateIndex
CREATE INDEX "tracking_pings_activationId_capturedAt_idx" ON "tracking_pings"("activationId", "capturedAt");

-- CreateIndex
CREATE INDEX "leave_requests_staffId_idx" ON "leave_requests"("staffId");

-- CreateIndex
CREATE INDEX "supervisor_tasks_campaignId_idx" ON "supervisor_tasks"("campaignId");

-- CreateIndex
CREATE INDEX "supervisor_routes_campaignId_idx" ON "supervisor_routes"("campaignId");

-- CreateIndex
CREATE INDEX "supervisor_routes_supervisorStaffId_idx" ON "supervisor_routes"("supervisorStaffId");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_roleId_idx" ON "users"("roleId");

-- CreateIndex
CREATE INDEX "campaign_access_grants_userId_idx" ON "campaign_access_grants"("userId");

-- CreateIndex
CREATE INDEX "campaign_access_grants_campaignId_idx" ON "campaign_access_grants"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_access_grants_userId_campaignId_key" ON "campaign_access_grants"("userId", "campaignId");

-- AddForeignKey
ALTER TABLE "brands" ADD CONSTRAINT "brands_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributor_points" ADD CONSTRAINT "distributor_points_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_reportsToStaffId_fkey" FOREIGN KEY ("reportsToStaffId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_linkedUserId_fkey" FOREIGN KEY ("linkedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_refresh_tokens" ADD CONSTRAINT "staff_refresh_tokens_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_items" ADD CONSTRAINT "campaign_items_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_items" ADD CONSTRAINT "campaign_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activations" ADD CONSTRAINT "activations_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activations" ADD CONSTRAINT "activations_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activations" ADD CONSTRAINT "activations_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activations" ADD CONSTRAINT "activations_supervisorStaffId_fkey" FOREIGN KEY ("supervisorStaffId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activations" ADD CONSTRAINT "activations_distributorPointId_fkey" FOREIGN KEY ("distributorPointId") REFERENCES "distributor_points"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activation_items" ADD CONSTRAINT "activation_items_activationId_fkey" FOREIGN KEY ("activationId") REFERENCES "activations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activation_items" ADD CONSTRAINT "activation_items_campaignItemId_fkey" FOREIGN KEY ("campaignItemId") REFERENCES "campaign_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activation_targets" ADD CONSTRAINT "activation_targets_activationId_fkey" FOREIGN KEY ("activationId") REFERENCES "activations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_activationId_fkey" FOREIGN KEY ("activationId") REFERENCES "activations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "leave_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_records" ADD CONSTRAINT "sales_records_activationItemId_fkey" FOREIGN KEY ("activationItemId") REFERENCES "activation_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_stats" ADD CONSTRAINT "daily_stats_activationId_fkey" FOREIGN KEY ("activationId") REFERENCES "activations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_summaries" ADD CONSTRAINT "sales_summaries_activationId_fkey" FOREIGN KEY ("activationId") REFERENCES "activations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_pings" ADD CONSTRAINT "tracking_pings_activationId_fkey" FOREIGN KEY ("activationId") REFERENCES "activations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisor_tasks" ADD CONSTRAINT "supervisor_tasks_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisor_routes" ADD CONSTRAINT "supervisor_routes_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisor_routes" ADD CONSTRAINT "supervisor_routes_supervisorStaffId_fkey" FOREIGN KEY ("supervisorStaffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_access_grants" ADD CONSTRAINT "campaign_access_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_access_grants" ADD CONSTRAINT "campaign_access_grants_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
