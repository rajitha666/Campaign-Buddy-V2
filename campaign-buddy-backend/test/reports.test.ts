import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/utils/prisma";
import { app, resetDb, adminToken, makeCampaignWithActivation } from "./helpers";
import { colomboMonth, colomboYmd, dayDate, lastDayOfMonth } from "../src/utils/dates";

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

  const d = (n: number) => dayDate().getTime() - n * 86400000;

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
    const yesterday = new Date(dayDate().getTime() - 86400000).toISOString().slice(0, 10);
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
  it("aggregates sales per (outlet, brand), not brand alone (client doc D — replaces Overall Brand Wise)", async () => {
    const f = await buildReportsFixture();
    const res = await request(app)
      .get(`/admin/v1/campaigns/${f.campaign.id}/reports/brand-wise`)
      .set("Authorization", `Bearer ${await adminToken()}`);
    expect(res.status).toBe(200);
    const rows = res.body.data as any[];
    expect(rows).toHaveLength(3); // (outlet1,B), (outlet2,B), (outlet2,Brand B)
    expect(rows.find((r) => r.outletId === f.outlet.id && r.brandName === "B")).toMatchObject({ outletName: "Outlet", itemCount: 20, totalSales: 20000 });
    expect(rows.find((r) => r.outletId === f.outlet2.id && r.brandName === "B")).toMatchObject({ itemCount: 13, totalSales: 13000 });
    expect(rows.find((r) => r.outletId === f.outlet2.id && r.brandName === "Brand B")).toMatchObject({ itemCount: 40, totalSales: 10000 });
    expect(res.body.meta.grandTotal).toBe(43000);
  });
});

describe("GET /admin/v1/campaigns/:id/reports/outlet-wise", () => {
  it("rolls up sales, footfall, approach and conversion per outlet — one row per outlet, no promoter breakdown", async () => {
    const f = await buildReportsFixture();
    const res = await request(app)
      .get(`/admin/v1/campaigns/${f.campaign.id}/reports/outlet-wise`)
      .set("Authorization", `Bearer ${await adminToken()}`);
    expect(res.status).toBe(200);
    const rows = res.body.data as any[];
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.outletId === f.outlet.id)).toMatchObject({
      footFall: 120, approached: 0, converted: 0, totalSales: 20000, target: 0, achievementPct: 0,
    });
    expect(rows.find((r) => r.outletId === f.outlet2.id)).toMatchObject({ footFall: 80, totalSales: 23000 });
    expect(rows.every((r) => !("staffName" in r))).toBe(true);
    expect(res.body.meta.customFieldDefs).toEqual([]);
  });

  it("merges a second activation at the same outlet into one row instead of splitting by promoter", async () => {
    const f = await buildReportsFixture();
    const staff3 = await prisma.staff.create({
      data: {
        employeeId: `EMP3-${Math.random().toString(36).slice(2, 8)}`, fullName: "Staff Three", displayName: "S3",
        userType: "promoter", mobileUsername: `staff3_${Math.random().toString(36).slice(2, 8)}`, passwordHash: "x", status: "active",
      },
    });
    const activation3 = await prisma.activation.create({
      data: { name: "Activation 3", campaignId: f.campaign.id, outletId: f.outlet.id, staffId: staff3.id, dateFrom: f.campaign.startDate, dateTo: f.campaign.endDate },
    });
    const today = dayDate();
    await prisma.dailyStats.create({ data: { activationId: activation3.id, date: today, footFall: 15, approached: 6, converted: 2 } });

    const res = await request(app)
      .get(`/admin/v1/campaigns/${f.campaign.id}/reports/outlet-wise`)
      .set("Authorization", `Bearer ${await adminToken()}`);
    expect(res.status).toBe(200);
    const rows = res.body.data as any[];
    expect(rows).toHaveLength(2); // still one row per outlet, not per activation
    const mine = rows.find((r) => r.outletId === f.outlet.id);
    expect(mine).toMatchObject({ footFall: 135, approached: 6, converted: 2 }); // 120 + 15
  });

  it("sums achievement across every target overlapping the range, and target value", async () => {
    const f = await buildReportsFixture();
    const today = colomboYmd();
    await prisma.activationTarget.create({
      data: {
        activationId: f.activation.id, dateFrom: new Date(today), dateTo: new Date(today),
        targetItemId: f.item.id, targetValue: 50,
      },
    });
    const res = await request(app)
      .get(`/admin/v1/campaigns/${f.campaign.id}/reports/outlet-wise`)
      .query({ dateFrom: today, dateTo: today })
      .set("Authorization", `Bearer ${await adminToken()}`);
    expect(res.status).toBe(200);
    const mine = (res.body.data as any[]).find((r) => r.outletId === f.outlet.id);
    // day0 sale for outlet1/item1 is 20 units (unit_wise default) against a target of 50
    expect(mine).toMatchObject({ target: 50, achievementPct: 40 });
  });

  it("sums a number-type day-scope custom field per outlet over the date range, listing it (with type) in meta.customFieldDefs", async () => {
    const f = await buildReportsFixture();
    const fieldsBase = `/admin/v1/campaigns/${f.campaign.id}/sales-fields`;
    const token = await adminToken();
    await request(app).post(fieldsBase).set("Authorization", `Bearer ${token}`)
      .send({ label: "Samples Given", type: "number", scope: "day" });
    const today = colomboYmd();
    const yesterday = new Date(dayDate().getTime() - 86400000).toISOString().slice(0, 10);
    await request(app).put(`/admin/v1/campaigns/${f.campaign.id}/sales/custom-values`).set("Authorization", `Bearer ${token}`)
      .send({ activationId: f.activation.id, date: today, day: { samples_given: 4 } });
    await request(app).put(`/admin/v1/campaigns/${f.campaign.id}/sales/custom-values`).set("Authorization", `Bearer ${token}`)
      .send({ activationId: f.activation.id, date: yesterday, day: { samples_given: 3 } });

    const res = await request(app)
      .get(`/admin/v1/campaigns/${f.campaign.id}/reports/outlet-wise`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.meta.customFieldDefs).toEqual([{ key: "samples_given", label: "Samples Given", type: "number" }]);
    const mine = (res.body.data as any[]).find((r) => r.outletId === f.outlet.id);
    expect(mine.samples_given).toBe(7);
    const other = (res.body.data as any[]).find((r) => r.outletId === f.outlet2.id);
    expect(other.samples_given).toBe(0);
  });

  it("shows the latest value (not a sum) for a non-numeric day-scope custom field, over the date range", async () => {
    const f = await buildReportsFixture();
    const fieldsBase = `/admin/v1/campaigns/${f.campaign.id}/sales-fields`;
    const token = await adminToken();
    await request(app).post(fieldsBase).set("Authorization", `Bearer ${token}`)
      .send({ label: "Weather", type: "select", scope: "day", options: ["Sunny", "Rain"] });
    const today = colomboYmd();
    const yesterday = new Date(dayDate().getTime() - 86400000).toISOString().slice(0, 10);
    await request(app).put(`/admin/v1/campaigns/${f.campaign.id}/sales/custom-values`).set("Authorization", `Bearer ${token}`)
      .send({ activationId: f.activation.id, date: yesterday, day: { weather: "Rain" } });
    await request(app).put(`/admin/v1/campaigns/${f.campaign.id}/sales/custom-values`).set("Authorization", `Bearer ${token}`)
      .send({ activationId: f.activation.id, date: today, day: { weather: "Sunny" } });

    const res = await request(app)
      .get(`/admin/v1/campaigns/${f.campaign.id}/reports/outlet-wise`)
      .query({ dateFrom: yesterday, dateTo: today })
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.meta.customFieldDefs).toContainEqual({ key: "weather", label: "Weather", type: "select" });
    const mine = (res.body.data as any[]).find((r) => r.outletId === f.outlet.id);
    expect(mine.weather).toBe("Sunny"); // the later of the two days in range
  });
});

describe("GET /admin/v1/campaigns/:id/reports/reorder", () => {
  it("returns only records flagged for reorder on the requested day", async () => {
    const f = await buildReportsFixture();
    const today = colomboYmd();
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
    const yesterday = new Date(dayDate().getTime() - 86400000).toISOString().slice(0, 10);
    const res = await request(app)
      .get(`/admin/v1/campaigns/${f.campaign.id}/reports/reorder`)
      .query({ date: yesterday })
      .set("Authorization", `Bearer ${await adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

describe("GET /admin/v1/campaigns/:id/reports/sales-status", () => {
  it("lists every activation running today: absent (no check-in), pending (checked in, unconfirmed), or completed (confirmed)", async () => {
    const f = await buildReportsFixture();
    const today = colomboYmd();
    const res = await request(app)
      .get(`/admin/v1/campaigns/${f.campaign.id}/reports/sales-status`)
      .query({ date: today })
      .set("Authorization", `Bearer ${await adminToken()}`);
    expect(res.status).toBe(200);
    const rows = res.body.data as any[];
    expect(rows).toHaveLength(2); // both activations, neither checked in nor confirmed yet
    expect(rows.every((r) => r.status === "absent")).toBe(true);
    const mine = rows.find((r) => r.outletName === f.outlet.name);
    expect(mine).toMatchObject({ staffName: f.staff.fullName });
    expect(mine.footFall).toBeUndefined();

    // Checks in but hasn't confirmed sales yet -> pending
    await prisma.attendanceRecord.create({
      data: { activationId: f.activation2.id, staffId: f.activation2.staffId, date: new Date(today), checkInAt: new Date(), status: "on_time" },
    });
    // Confirms sales -> completed (even without an explicit check-in row)
    await prisma.salesSummary.create({
      data: { activationId: f.activation.id, date: new Date(today), confirmed: true, confirmedAt: new Date() },
    });
    const after = await request(app)
      .get(`/admin/v1/campaigns/${f.campaign.id}/reports/sales-status`)
      .query({ date: today })
      .set("Authorization", `Bearer ${await adminToken()}`);
    const rows2 = after.body.data as any[];
    expect(rows2.find((r) => r.activationId === f.activation.id).status).toBe("completed");
    expect(rows2.find((r) => r.activationId === f.activation2.id).status).toBe("pending");
  });

  it("omits an activation whose date range doesn't cover the requested day", async () => {
    const f = await buildReportsFixture();
    const pastDay = new Date(dayDate().getTime() - 90 * 86400000).toISOString().slice(0, 10);
    const res = await request(app)
      .get(`/admin/v1/campaigns/${f.campaign.id}/reports/sales-status`)
      .query({ date: pastDay })
      .set("Authorization", `Bearer ${await adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

describe("GET /admin/v1/campaigns/:id/reports/attendance-monthly", () => {
  it("maps attendance statuses into the day grid", async () => {
    const f = await buildReportsFixture();
    // Use the same Colombo-calendar convention dayDate() uses, so the test
    // matches whatever the route treats as "this month" no matter the clock.
    const month = colomboMonth();
    const ymd = (d: Date) => d.toISOString().slice(0, 10);
    const base = dayDate();
    const today = ymd(base);
    const yesterday = ymd(new Date(base.getTime() - 86400000));
    const beforeYesterday = ymd(new Date(base.getTime() - 2 * 86400000));
    // If the month rolled over mid-fixture, these dates are in the previous month — skip rather than flake
    if (![today, yesterday, beforeYesterday].every((d) => d.startsWith(month))) return;
    await prisma.attendanceRecord.createMany({
      data: [
        { activationId: f.activation.id, staffId: f.activation.staffId, date: dayDate(today), checkInAt: new Date(), status: "on_time" },
        { activationId: f.activation.id, staffId: f.activation.staffId, date: dayDate(yesterday), status: "absent" },
        { activationId: f.activation.id, staffId: f.activation.staffId, date: dayDate(beforeYesterday), status: "leave" },
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
    expect(res.body.data.days).toHaveLength(lastDayOfMonth(month).getUTCDate());
  });
});
