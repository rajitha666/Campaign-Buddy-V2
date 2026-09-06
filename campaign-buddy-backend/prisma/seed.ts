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

  // ---- Sample catalog ----
  const client = await prisma.client.create({
    data: { companyName: "Prisha Naturals (Pvt) Ltd", clientName: "Prisha Naturals", contactNumber: "+94 11 234 5678", email: "contact@prishanaturals.lk" },
  });
  const brand = await prisma.brand.create({ data: { name: "Sulfate Free Shampoo Range", clientId: client.id } });
  const item = await prisma.item.create({
    data: { brandId: brand.id, sku: "TT-320", name: "Tea Tree Shampoo 320ml", unitPrice: 3200, reorderLevel: 5 },
  });

  const city = await prisma.city.create({ data: { name: "Nawala", province: "Western", district: "Colombo" } });
  const outlet = await prisma.outlet.create({
    data: { outletNo: "OUT-0001", name: "Nawala Retail Outlet", cityId: city.id, latitude: 6.8845, longitude: 79.8887 },
  });

  const campaign = await prisma.campaign.create({
    data: {
      campaignNo: "CMP-0001",
      name: "Sktest Activation",
      clientId: client.id,
      startDate: new Date(Date.now() - 5 * 86400000),
      endDate: new Date(Date.now() + 25 * 86400000),
    },
  });
  await prisma.campaignAccessGrant.create({
    data: { userId: adminUser.id, campaignId: campaign.id, scopeType: "all", outletIds: [] },
  });
  const campaignItem = await prisma.campaignItem.create({ data: { campaignId: campaign.id, itemId: item.id } });

  // ---- Sample mobile Staff login ----
  const staffPasswordHash = await bcrypt.hash("Field123!", 10);
  const staff = await prisma.staff.create({
    data: {
      employeeId: "EMP-0001",
      fullName: "Sanduni Kumari",
      displayName: "Sanduni",
      userType: "promoter",
      mobileUsername: "sktest",
      passwordHash: staffPasswordHash,
      cityId: city.id,
      status: "active",
    },
  });

  const activation = await prisma.activation.create({
    data: {
      name: "Nawala Weekday Push",
      campaignId: campaign.id,
      outletId: outlet.id,
      staffId: staff.id,
      dateFrom: campaign.startDate,
      dateTo: campaign.endDate,
    },
  });
  await prisma.activationItem.create({ data: { activationId: activation.id, campaignItemId: campaignItem.id } });

  // Note: no SupervisorRoute seed row — new entity in v3, left empty by default.

  console.log("Seed complete:");
  console.log("  Admin portal login → admin / ChangeMe123!");
  console.log("  Mobile app login   → sktest / Field123!");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
