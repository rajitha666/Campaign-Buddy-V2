import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/utils/prisma";
import { app, resetDb, staffToken, makeCampaignWithActivation, makeStaff } from "./helpers";

beforeEach(resetDb);

describe("GET /v1/stats/today", () => {
  it("returns zeros when staff has no activation", async () => {
    const staff = await makeStaff();
    const token = await staffToken(staff.mobileUsername, "field-pw");

    const res = await request(app).get("/v1/stats/today").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      footFall: 0,
      approached: 0,
      converted: 0,
      conversionRate: 0,
      totalSales: 0,
    });
  });

  it("returns saved stats after PATCH", async () => {
    const { staff, outlet } = await makeCampaignWithActivation();
    const token = await staffToken(staff.mobileUsername, "field-pw");
    await request(app).post("/v1/attendance/check-in").set("Authorization", `Bearer ${token}`).send({ latitude: outlet.latitude, longitude: outlet.longitude });

    const patch = await request(app)
      .patch("/v1/stats/today")
      .set("Authorization", `Bearer ${token}`)
      .send({ footFall: 10, approached: 5, converted: 2 });
    expect(patch.status).toBe(200);
    expect(patch.body.data.footFall).toBe(10);
    expect(patch.body.data.approached).toBe(5);
    expect(patch.body.data.converted).toBe(2);
    expect(patch.body.data.conversionRate).toBe(0.4);

    const get = await request(app).get("/v1/stats/today").set("Authorization", `Bearer ${token}`);
    expect(get.status).toBe(200);
    expect(get.body.data.footFall).toBe(10);
  });
});

describe("PATCH /v1/stats/today", () => {
  it("returns 422 when staff has no activation", async () => {
    const staff = await makeStaff();
    const token = await staffToken(staff.mobileUsername, "field-pw");

    const res = await request(app)
      .patch("/v1/stats/today")
      .set("Authorization", `Bearer ${token}`)
      .send({ footFall: 4, approached: 5, converted: 5 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("NO_ACTIVATION");
  });

  it("is blocked before check-in and allowed after (#51)", async () => {
    const { staff, outlet } = await makeCampaignWithActivation();
    const token = await staffToken(staff.mobileUsername, "field-pw");

    const blocked = await request(app)
      .patch("/v1/stats/today")
      .set("Authorization", `Bearer ${token}`)
      .send({ footFall: 4 });
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.code).toBe("NOT_CHECKED_IN");

    await request(app).post("/v1/attendance/check-in").set("Authorization", `Bearer ${token}`).send({ latitude: outlet.latitude, longitude: outlet.longitude });

    const okRes = await request(app)
      .patch("/v1/stats/today")
      .set("Authorization", `Bearer ${token}`)
      .send({ footFall: 4 });
    expect(okRes.status).toBe(200);
    expect(okRes.body.data.footFall).toBe(4);
  });
});

describe("performance day counts (#53)", () => {
  // Monday 00:00 UTC of the current week as the campaign start, so the range
  // always spans at least one weekend regardless of when the suite runs.
  function utcMonday(offsetDays = 0) {
    const now = new Date();
    const dow = (now.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dow + offsetDays));
  }

  function workingDays(from: Date, to: Date) {
    let count = 0;
    for (const d = new Date(from); d.getTime() <= to.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
      if (d.getUTCDay() % 6 !== 0) count++; // skip Sat(6)/Sun(0)
    }
    return count;
  }

  it("counts working days, not calendar days", async () => {
    const { client, brand, item, city, outlet, staff } = await makeCampaignWithActivation();
    const dateFrom = utcMonday(-7); // previous Monday
    const dateTo = new Date(dateFrom.getTime() + 13 * 86400000); // ends this Sunday — two weekends inside
    const campaign = await prisma.campaign.create({
      data: { campaignNo: "CMP-WKD", name: "Campaign", clientId: client.id, startDate: dateFrom, endDate: dateTo },
    });
    await prisma.activation.create({
      data: { name: "Activation", campaignId: campaign.id, outletId: outlet.id, staffId: staff.id, dateFrom, dateTo },
    });
    const token = await staffToken(staff.mobileUsername, "field-pw");

    const res = await request(app)
      .get(`/v1/campaigns/${campaign.id}/performance`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    // Calendar span is 14 days but only 10 are weekdays.
    expect(res.body.data.totalDays).toBe(10);
    expect(res.body.data.totalDays).not.toBe(14);
    expect(res.body.data.dayNumber).toBe(workingDays(dateFrom, new Date()));
    expect(item.unitPrice).toBe(1000); // silence unused fixture vars
    void brand; void city; void client;
  });
});

describe("GET /v1/stats/range", () => {
  function ymd(offsetDays: number) {
    return new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
  }

  it("returns zero-seeded days when staff has no activation", async () => {
    const staff = await makeStaff();
    const token = await staffToken(staff.mobileUsername, "field-pw");

    const res = await request(app).get("/v1/stats/range").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.days).toHaveLength(7);
    expect(res.body.data.days[6].date).toBe(ymd(0)); // last row = today
    expect(res.body.data.total.totalSales).toBe(0);
    expect(res.body.data.total.approached).toBe(0);
  });

  it("aggregates the rep's own stats and sales per day", async () => {
    const { staff, activation, activationItem, item } = await makeCampaignWithActivation();
    const token = await staffToken(staff.mobileUsername, "field-pw");

    // Today and yesterday rows on the same activation (created directly so the
    // fixture is independent of how /stats/today derives "today" locally).
    await prisma.salesRecord.create({
      data: { activationItemId: activationItem.id, date: new Date(), openingStock: 20, soldToday: 3 },
    });
    await prisma.salesRecord.create({
      data: { activationItemId: activationItem.id, date: new Date(Date.now() - 1 * 86400000), openingStock: 25, soldToday: 2 },
    });
    await prisma.dailyStats.createMany({
      data: [
        { activationId: activation.id, date: new Date(), footFall: 30, approached: 10, converted: 4 },
        { activationId: activation.id, date: new Date(Date.now() - 1 * 86400000), footFall: 10, approached: 6, converted: 1 },
      ],
    });

    const res = await request(app).get("/v1/stats/range").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const days = res.body.data.days;
    expect(days).toHaveLength(7);

    const todayRow = days.find((d: any) => d.date === ymd(0));
    const yestRow = days.find((d: any) => d.date === ymd(-1));
    expect(todayRow.totalSales).toBe(3000);
    expect(todayRow.itemsSold).toBe(3);
    expect(todayRow.itemsReceived).toBe(20);
    expect(todayRow.footFall).toBe(30);
    expect(todayRow.approached).toBe(10);
    expect(todayRow.converted).toBe(4);
    expect(todayRow.conversionRate).toBe(0.4);
    expect(yestRow.totalSales).toBe(2000);
    expect(yestRow.conversionRate).toBeCloseTo(1 / 6);

    expect(res.body.data.total.totalSales).toBe(5000);
    expect(res.body.data.total.itemsSold).toBe(5);
    expect(res.body.data.total.converted).toBe(5);
    expect(item.unitPrice).toBe(1000); // sanity on the fixture
  });
});

describe("GET /v1/campaigns/:campaignId/performance", () => {
  it("returns empty data when staff has no activation on the campaign", async () => {
    const staff = await makeStaff();
    const { campaign } = await makeCampaignWithActivation();
    const token = await staffToken(staff.mobileUsername, "field-pw");

    const res = await request(app)
      .get(`/v1/campaigns/${campaign.id}/performance`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.totalSales).toBe(0);
    expect(res.body.data.totalUnitsSold).toBe(0);
    expect(res.body.data.totalApproached).toBe(0);
    expect(res.body.data.dailySales).toEqual([]);
    expect(res.body.data.topProducts).toEqual([]);
    expect(res.body.data.dayNumber).toBe(0);
    expect(res.body.data.totalDays).toBe(0);
    expect(res.body.data.startDate).toBeNull();
  });

  it("returns performance data when staff has an activation", async () => {
    const { staff, campaign } = await makeCampaignWithActivation();
    const token = await staffToken(staff.mobileUsername, "field-pw");

    const res = await request(app)
      .get(`/v1/campaigns/${campaign.id}/performance`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.campaignName).toBe("Campaign");
    expect(res.body.data.totalSales).toBe(0);
    expect(res.body.data.dayNumber).toBeGreaterThanOrEqual(1);
  });
});
