import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/utils/prisma";
import { app, resetDb, adminToken, makeCampaignWithActivation } from "./helpers";

beforeEach(resetDb);

// The computed reports (§5.10 / §5.2). Build a small fixture: campaign with two
// outlets, two items from two brands, sales on two days, footfall stats.
async function buildReportsFixture() {
  const base = await makeCampaignWithActivation();
  // second outlet + second activation (same campaign)
  const outlet2 = await prisma.outlet.create({
    data: {
      outletNo: `O2-${Math.random().toString(36).slice(2, 7)}`,
      name: "Outlet 2",
      cityId: base.city.id,
      latitude: 7.1,
      longitude: 80.1,
    },
  });
  const staff2 = await prisma.staff.create({
    data: {
      employeeId: `EMP2-${Math.random().toString(36).slice(2, 8)}`,
      fullName: "Staff Outlet2",
      displayName: "S2",
      userType: "promoter",
      mobileUsername: `staff2_${Math.random().toString(36).slice(2, 8)}`,
      passwordHash: "x",
      status: "active",
    },
  });
  const activation2 = await prisma.activation.create({
    data: {
      name: "Activation 2",
      campaignId: base.campaign.id,
      outletId: outlet2.id,
      staffId: staff2.id,
      dateFrom: base.campaign.startDate,
      dateTo: base.campaign.endDate,
    },
  });
  // second item under a second brand, same campaign
  const brand2 = await prisma.brand.create({ data: { name: "Brand B", clientId: base.client.id } });
  const item2 = await prisma.item.create({ data: { brandId: brand2.id, sku: "SKU-2", name: "Item B", unitPrice: 250 } });
  const campaignItem2 = await prisma.campaignItem.create({ data: { campaignId: base.campaign.id, itemId: item2.id } });
  const activationItem2 = await prisma.activationItem.create({
    data: { activationId: activation2.id, campaignItemId: campaignItem2.id },
  });
  // also add the base item to activation 2 so both items report on both outlets
  const activationItemBase2 = await prisma.activationItem.create({
    data: { activationId: activation2.id, campaignItemId: base.campaignItem.id },
  });

  const d = (n: number) => new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime() - n * 86400000;

  await Promise.all([
    // outlet 1: item 1, day 0
    prisma.salesRecord.create({ data: { activationItemId: base.activationItem.id, date: new Date(d(0)), openingStock: 50, soldToday: 20, reorderFlag: false } }),
    // outlet 2: item 1, day 0 + day 1 (reorder)
    prisma.salesRecord.create({ data: { activationItemId: activationItemBase2.id, date: new Date(d(0)), openingStock: 10, soldToday: 8, reorderFlag: true } }),
    prisma.salesRecord.create({ data: { activationItemId: activationItemBase2.id, date: new Date(d(1)), openingStock: 100, soldToday: 5, reorderFlag: false } }),
    // outlet 2: item 2 (Brand B), day 0
    prisma.salesRecord.create({ data: { activationItemId: activationItem2.id, date: new Date(d(0)), openingStock: 100, soldToday: 40, reorderFlag: false } }),
    // footfall
    prisma.dailyStats.create({ data: { activationId: base.activation.id, date: new Date(d(0)), footFall: 120 } }),
    prisma.dailyStats.create({ data: { activationId: activation2.id, date: new Date(d(0)), footFall: 80 } }),
  ]);

  return { ...base, outlet2, activation2, brand2, item2, campaignItem2, activationItem2, activationItemBase2 };
}

describe("GET /admin/v1/campaigns/:id/reports/sku-wise", () => {
  it("aggregates sales per item with brand and grand total", async () => {
    const f = await buildReportsFixture();
    const res = await request(app)
      .get(`/admin/v1/campaigns/${f.campaign.id}/reports/sku-wise`)
      .set("Authorization", `Bearer ${await adminToken()}`);
    expect(res.status).toBe(200);
    // 20 @ 1000 + (8 + 5) @ 1000 + 40 @ 250
    const rows = res.body.data as any[];
    expect(rows).toHaveLength(2);

    const item1 = rows.find((r) => r.itemName === "Item 1");
    expect(item1).toMatchObject({ brandName: "B", itemCount: 33, totalSales: 33000 });
    const itemB = rows.find((r) => r.itemName === "Item B");
    expect(itemB).toMatchObject({ brandName: "Brand B", itemCount: 40, totalSales: 10000 });
    expect(res.body.meta).toEqual({ total: 2, grandTotal: 43000 });
  });

  it("filters by date range", async () => {
    const f = await buildReportsFixture();
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const res = await request(app)
      .get(`/admin/v1/campaigns/${f.campaign.id}/reports/sku-wise`)
      .query({ dateFrom: yesterday, dateTo: yesterday })
      .set("Authorization", `Bearer ${await adminToken()}`);
    expect(res.status).toBe(200);
    // day-1 only: item1 sold 5
    expect(res.body.data).toEqual([{ itemName: "Item 1", brandName: "B", itemCount: 5, totalSales: 5000 }]);
  });

  it("filters by a single outlet", async () => {
    const f = await buildReportsFixture();
    const res = await request(app)
      .get(`/admin/v1/campaigns/${f.campaign.id}/reports/sku-wise`)
      .query({ outletId: f.outlet2.id })
      .set("Authorization", `Bearer ${await adminToken()}`);
    expect(res.status).toBe(200);
    // outlet 2 only: item1 13@1000 + itemB 40@250
    expect(res.body.meta.grandTotal).toBe(23000);
  });
});

describe("GET /admin/v1/campaigns/:id/reports/brand-wise", () => {
  it("aggregates sales per brand", async () => {
    const f = await buildReportsFixture();
    const res = await request(app)
      .get(`/admin/v1/campaigns/${f.campaign.id}/reports/brand-wise`)
      .set("Authorization", `Bearer ${await adminToken()}`);
    expect(res.status).toBe(200);
    const rows = res.body.data as any[];
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.brandName === "B")).toMatchObject({ itemCount: 33, totalSales: 33000 });
    expect(rows.find((r) => r.brandName === "Brand B")).toMatchObject({ itemCount: 40, totalSales: 10000 });
    expect(res.body.meta.grandTotal).toBe(43000);
  });
});

describe("GET /admin/v1/campaigns/:id/reports/outlet-wise", () => {
  it("rolls up sales and footfall per outlet", async () => {
    const f = await buildReportsFixture();
    const res = await request(app)
      .get(`/admin/v1/campaigns/${f.campaign.id}/reports/outlet-wise`)
      .set("Authorization", `Bearer ${await adminToken()}`);
    expect(res.status).toBe(200);
    const rows = res.body.data as any[];
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.outletId === f.outlet.id)).toMatchObject({ footFall: 120, totalSales: 20000 });
    expect(rows.find((r) => r.outletId === f.outlet2.id)).toMatchObject({ footFall: 80, totalSales: 23000 });
  });
});

describe("GET /admin/v1/campaigns/:id/reports/reorder", () => {
  it("returns only records flagged for reorder on the requested day", async () => {
    const f = await buildReportsFixture();
    const today = new Date().toISOString().slice(0, 10);
    const res = await request(app)
      .get(`/admin/v1/campaigns/${f.campaign.id}/reports/reorder`)
      .query({ date: today })
      .set("Authorization", `Bearer ${await adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      itemName: "Item 1",
      outletName: "Outlet 2",
      openingStock: 10,
      soldToday: 8,
      remainingStock: 2,
    });
  });

  it("returns nothing when nothing is flagged", async () => {
    const f = await buildReportsFixture();
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const res = await request(app)
      .get(`/admin/v1/campaigns/${f.campaign.id}/reports/reorder`)
      .query({ date: yesterday })
      .set("Authorization", `Bearer ${await adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

describe("GET /admin/v1/campaigns/:id/reports/attendance-monthly", () => {
  it("maps attendance statuses into the day grid", async () => {
    const f = await buildReportsFixture();
    const month = new Date().toISOString().slice(0, 7);
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const beforeYesterday = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
    // If the month rolled over mid-fixture, these dates are in the previous month — skip rather than flake
    if (!today.startsWith(month)) return;
    await prisma.attendanceRecord.createMany({
      data: [
        { activationId: f.activation.id, date: new Date(today), checkInAt: new Date(), status: "on_time" },
        { activationId: f.activation.id, date: new Date(yesterday), status: "absent" },
        { activationId: f.activation.id, date: new Date(beforeYesterday), status: "leave" },
      ],
    });
    const res = await request(app)
      .get(`/admin/v1/campaigns/${f.campaign.id}/reports/attendance-monthly`)
      .query({ month })
      .set("Authorization", `Bearer ${await adminToken()}`);
    expect(res.status).toBe(200);
    const rows = res.body.data.rows as any[];
    expect(rows).toHaveLength(2); // both activations appear
    const mine = rows.find((r) => r.outletName === f.outlet.name);
    expect(mine.staffName).toBe(f.staff.fullName);
    expect(mine.days[Number(today.slice(8))]).toBe("✓");
    expect(mine.days[Number(yesterday.slice(8))]).toBe("A");
    expect(mine.days[Number(beforeYesterday.slice(8))]).toBe("L");
    expect(res.body.data.days).toHaveLength(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate());
  });
});
