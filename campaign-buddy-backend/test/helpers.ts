import bcrypt from "bcrypt";
import request from "supertest";
import { prisma } from "../src/utils/prisma";
import { app } from "../src/app";

export { app };

// Wipe every table and re-create the 4 roles + the super-admin user. Cheap
// enough to call in a beforeEach.
export async function resetDb() {
  const tables: string[] = await prisma
    .$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
    .then((rows) => rows.map((r) => r.tablename));
  if (tables.length) {
    await prisma.$executeRawUnsafe(
      `TRUNCATE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`
    );
  }

  await prisma.role.createMany({
    data: [
      { id: "adm", label: "Super Admin", modules: ["*"], functionality: ["*"], defaultUrl: "/dashboard" },
      { id: "usr", label: "Campaign Admin", modules: ["*"], functionality: ["view", "add", "edit", "delete"], defaultUrl: "/dashboard" },
      { id: "supervisor", label: "Supervisor", modules: ["campaigns"], functionality: ["view"], defaultUrl: "/portal/campaigns" },
      { id: "sponsor", label: "Sponsor", modules: ["campaigns"], functionality: ["view"], defaultUrl: "/portal/campaigns" },
    ],
  });
  await prisma.user.create({
    data: {
      username: "admin",
      passwordHash: await bcrypt.hash("admin-pw", 4),
      displayName: "Super Admin",
      roleId: "adm",
    },
  });
}

// ---- login helpers -------------------------------------------------------
export async function adminToken(username = "admin", password = "admin-pw") {
  const res = await request(app).post("/admin/v1/auth/login").send({ username, password });
  return res.body.data.accessToken as string;
}

export async function staffToken(mobileUsername: string, password: string) {
  const res = await request(app).post("/v1/auth/login").send({ username: mobileUsername, password });
  return res.body.data.accessToken as string;
}

// ---- fixture builders ---------------------------------------------------
export async function makeStaff(over: Partial<Parameters<typeof prisma.staff.create>[0]["data"]> = {}) {
  const n = Math.random().toString(36).slice(2, 8);
  return prisma.staff.create({
    data: {
      employeeId: `EMP-${n}`,
      fullName: `Staff ${n}`,
      displayName: `S${n}`,
      userType: "promoter",
      mobileUsername: `staff_${n}`,
      passwordHash: await bcrypt.hash("field-pw", 4),
      status: "active",
      ...over,
    } as any,
  });
}

export async function makeCampaignWithActivation() {
  const client = await prisma.client.create({ data: { companyName: "Co", clientName: "C" } });
  const brand = await prisma.brand.create({ data: { name: "B", clientId: client.id } });
  const item = await prisma.item.create({ data: { brandId: brand.id, sku: "SKU-1", name: "Item 1", unitPrice: 1000 } });
  const city = await prisma.city.create({ data: { name: "City", province: "P", district: "D" } });
  const outlet = await prisma.outlet.create({
    data: { outletNo: `O-${Math.random().toString(36).slice(2, 7)}`, name: "Outlet", cityId: city.id, latitude: 6.9, longitude: 79.9 },
  });
  const campaign = await prisma.campaign.create({
    data: {
      campaignNo: `CMP-${Math.random().toString(36).slice(2, 7)}`,
      name: "Campaign",
      clientId: client.id,
      startDate: new Date(Date.now() - 3 * 86400000),
      endDate: new Date(Date.now() + 20 * 86400000),
    },
  });
  await prisma.campaignAccessGrant.create({
    data: { userId: (await prisma.user.findFirstOrThrow({ where: { username: "admin" } })).id, campaignId: campaign.id, scopeType: "all" },
  });
  const campaignItem = await prisma.campaignItem.create({ data: { campaignId: campaign.id, itemId: item.id } });
  const staff = await makeStaff();
  const activation = await prisma.activation.create({
    data: {
      name: "Activation",
      campaignId: campaign.id,
      outletId: outlet.id,
      staffId: staff.id,
      dateFrom: campaign.startDate,
      dateTo: campaign.endDate,
    },
  });
  const activationItem = await prisma.activationItem.create({ data: { activationId: activation.id, campaignItemId: campaignItem.id } });
  return { client, brand, item, city, outlet, campaign, campaignItem, activation, activationItem, staff };
}
