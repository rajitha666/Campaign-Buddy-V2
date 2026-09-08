import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
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
    const { staff } = await makeCampaignWithActivation();
    const token = await staffToken(staff.mobileUsername, "field-pw");

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
