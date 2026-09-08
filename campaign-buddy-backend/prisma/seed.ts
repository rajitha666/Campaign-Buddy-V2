import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  // ---- Roles — exactly 4, confirmed v3 (Spec §2.7 / §7) ----
  const roleDefs = [
    { id: "adm", label: "Super Admin", description: "Full access, bypasses campaign access grants entirely", modules: ["*"], functionality: ["*"], defaultUrl: "/dashboard" },
    { id: "usr", label: "Campaign Admin", description: "Full access, but still grant-scoped", modules: ["*"], functionality: ["view", "add", "edit", "delete"], defaultUrl: "/dashboard" },
    { id: "supervisor", label: "Supervisor", description: "Read-only, outlet-scoped", modules: ["campaigns", "staff", "sales", "tracking", "reports"], functionality: ["view"], defaultUrl: "/portal/campaigns" },
    { id: "sponsor", label: "Sponsor", description: "Read-only, campaign-scoped", modules: ["campaigns", "sales", "tracking", "reports"], functionality: ["view"], defaultUrl: "/portal/campaigns" },
  ];
  for (const r of roleDefs) {
    await prisma.role.upsert({ where: { id: r.id }, create: r, update: r });
  }

  // ---- Super Admin user ----
  const adminPasswordHash = await bcrypt.hash("ChangeMe123!", 10);
  const adminUser = await prisma.user.upsert({
    where: { username: "admin" },
    create: { username: "admin", passwordHash: adminPasswordHash, displayName: "Super Admin", roleId: "adm" },
    update: {},
  });

  // ---- Sample catalog (idempotent) ----
  let client = await prisma.client.findFirst({ where: { companyName: "Prisha Naturals (Pvt) Ltd" } });
  if (!client) {
    client = await prisma.client.create({
      data: { companyName: "Prisha Naturals (Pvt) Ltd", clientName: "Prisha Naturals", contactNumber: "+94 11 234 5678", email: "contact@prishanaturals.lk" },
    });
  }

  let brand = await prisma.brand.findFirst({ where: { name: "Sulfate Free Shampoo Range", clientId: client.id } });
  if (!brand) {
    brand = await prisma.brand.create({ data: { name: "Sulfate Free Shampoo Range", clientId: client.id } });
  }

  let item = await prisma.item.findFirst({ where: { sku: "TT-320" } });
  if (!item) {
    item = await prisma.item.create({
      data: { brandId: brand.id, sku: "TT-320", name: "Tea Tree Shampoo 320ml", unitPrice: 3200, reorderLevel: 5 },
    });
  }

  let city = await prisma.city.findFirst({ where: { name: "Nawala", province: "Western" } });
  if (!city) {
    city = await prisma.city.create({ data: { name: "Nawala", province: "Western", district: "Colombo" } });
  }

  let outlet = await prisma.outlet.findFirst({ where: { outletNo: "OUT-0001" } });
  if (!outlet) {
    outlet = await prisma.outlet.create({
      data: { outletNo: "OUT-0001", name: "Nawala Retail Outlet", cityId: city.id, latitude: 6.8845, longitude: 79.8887 },
    });
  }

  const campaignStart = new Date(Date.now() - 5 * 86400000);
  const campaignEnd = new Date(Date.now() + 25 * 86400000);

  let campaign = await prisma.campaign.findFirst({ where: { campaignNo: "CMP-0001" } });
  if (!campaign) {
    campaign = await prisma.campaign.create({
      data: {
        campaignNo: "CMP-0001",
        name: "Sktest Activation",
        clientId: client.id,
        startDate: campaignStart,
        endDate: campaignEnd,
      },
    });
  } else {
    campaign = await prisma.campaign.update({
      where: { id: campaign.id },
      data: { startDate: campaignStart, endDate: campaignEnd },
    });
  }

  await prisma.campaignAccessGrant.upsert({
    where: { userId_campaignId: { userId: adminUser.id, campaignId: campaign.id } },
    create: { userId: adminUser.id, campaignId: campaign.id, scopeType: "all", outletIds: [] },
    update: {},
  });

  let campaignItem = await prisma.campaignItem.findFirst({ where: { campaignId: campaign.id, itemId: item.id } });
  if (!campaignItem) {
    campaignItem = await prisma.campaignItem.create({ data: { campaignId: campaign.id, itemId: item.id } });
  }

  // ---- Sample mobile Staff login ----
  const staffPasswordHash = await bcrypt.hash("Field123!", 10);
  let staff = await prisma.staff.findFirst({ where: { employeeId: "EMP-0001" } });
  if (!staff) {
    staff = await prisma.staff.create({
      data: {
        employeeId: "EMP-0001",
        fullName: "Sanduni Kumari",
        displayName: "Sanduni",
        userType: "promoter",
        mobileUsername: "sktest",
        phone: "+94770000001", // app login also accepts the mobile number (issue #3)
        passwordHash: staffPasswordHash,
        cityId: city.id,
        status: "active",
      },
    });
  } else if (!staff.phone) {
    // Backfill the mobile number on an already-seeded DB so number login works (issue #3).
    staff = await prisma.staff.update({ where: { id: staff.id }, data: { phone: "+94770000001" } });
  }

  let activation = await prisma.activation.findFirst({ where: { campaignId: campaign.id, outletId: outlet.id, staffId: staff.id } });
  if (!activation) {
    activation = await prisma.activation.create({
      data: {
        name: "Nawala Weekday Push",
        campaignId: campaign.id,
        outletId: outlet.id,
        staffId: staff.id,
        dateFrom: campaign.startDate,
        dateTo: campaign.endDate,
      },
    });
  } else {
    activation = await prisma.activation.update({
      where: { id: activation.id },
      data: { dateFrom: campaign.startDate, dateTo: campaign.endDate },
    });
  }

  const existingActivationItem = await prisma.activationItem.findFirst({ where: { activationId: activation.id, campaignItemId: campaignItem.id } });
  if (!existingActivationItem) {
    await prisma.activationItem.create({ data: { activationId: activation.id, campaignItemId: campaignItem.id } });
  }

  // Note: no SupervisorRoute seed row — new entity in v3, left empty by default.

  // ---- Sample custom sales fields (issue #13) ----
  const salesFields: Array<Parameters<typeof prisma.salesFieldDefinition.create>[0]["data"]> = [
    { campaignId: campaign.id, key: "weather", label: "Weather", type: "select", scope: "day", options: ["Sunny", "Cloudy", "Rain"], sortOrder: 1 },
    { campaignId: campaign.id, key: "competitor_promo", label: "Competitor promo running?", type: "boolean", scope: "day", sortOrder: 2 },
    { campaignId: campaign.id, key: "samples_given", label: "Samples given", type: "number", scope: "day", required: true, sortOrder: 3 },
    { campaignId: campaign.id, key: "damaged_units", label: "Damaged units", type: "number", scope: "product", sortOrder: 1 },
  ];
  for (const data of salesFields) {
    await prisma.salesFieldDefinition.upsert({
      where: { campaignId_key: { campaignId: data.campaignId as string, key: data.key as string } },
      create: data,
      update: {},
    });
  }

  console.log("Seed complete:");
  console.log("  Admin portal login → admin / ChangeMe123!");
  console.log("  Mobile app login   → sktest / Field123!");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
