import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/utils/prisma";
import { app, resetDb, staffToken, adminToken, makeStaff, makeCampaignWithActivation } from "./helpers";
import { totalTargetFromDaily } from "../src/utils/targets";

beforeEach(resetDb);

describe("totalTargetFromDaily (pure)", () => {
  it("multiplies the daily target by inclusive calendar days", () => {
    const from = new Date("2026-09-01T00:00:00.000Z");
    const to = new Date("2026-09-10T00:00:00.000Z"); // 10 days inclusive
    expect(totalTargetFromDaily(1000, from, to)).toBe(10_000);
  });

  it("propagates null when there's no active daily target", () => {
    expect(totalTargetFromDaily(null, new Date(), new Date())).toBeNull();
  });

  it("treats a same-day range as 1 day", () => {
    const d = new Date("2026-09-01T00:00:00.000Z");
    expect(totalTargetFromDaily(500, d, d)).toBe(500);
  });
});

describe("mobile Target display (#daily-target-display)", () => {
  it("GET /v1/sales-summary/today has target: null when no target is set", async () => {
    const { staff } = await makeCampaignWithActivation();
    const token = await staffToken(staff.mobileUsername, "field-pw");

    const res = await request(app).get("/v1/sales-summary/today").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.target).toBeNull();
  });

  it("GET /v1/sales-summary/today sums every target active today", async () => {
    const { activation, item, staff } = await makeCampaignWithActivation();
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await prisma.activationTarget.create({
      data: { activationId: activation.id, dateFrom: activation.dateFrom, dateTo: activation.dateTo, targetItemId: item.id, targetValue: 15000 },
    });
    await prisma.activationTarget.create({
      data: { activationId: activation.id, dateFrom: activation.dateFrom, dateTo: activation.dateTo, targetItemId: item.id, targetValue: 5000 },
    });
    const token = await staffToken(staff.mobileUsername, "field-pw");

    const res = await request(app).get("/v1/sales-summary/today").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.target).toBe(20000);
  });

  it("GET /v1/campaigns/:id/performance has totalTarget: null when no target is set", async () => {
    const { campaign, outlet, staff } = await makeCampaignWithActivation();
    const token = await staffToken(staff.mobileUsername, "field-pw");

    const res = await request(app)
      .get(`/v1/campaigns/${campaign.id}/performance`)
      .query({ outletId: outlet.id })
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.totalTarget).toBeNull();
  });

  it("GET /v1/campaigns/:id/performance projects the daily target across the activation's calendar days", async () => {
    const { campaign, outlet, activation, item, staff } = await makeCampaignWithActivation();
    await prisma.activationTarget.create({
      data: { activationId: activation.id, dateFrom: activation.dateFrom, dateTo: activation.dateTo, targetItemId: item.id, targetValue: 6000 },
    });
    const token = await staffToken(staff.mobileUsername, "field-pw");

    const res = await request(app)
      .get(`/v1/campaigns/${campaign.id}/performance`)
      .query({ outletId: outlet.id })
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const expectedDays = Math.round((activation.dateTo.getTime() - activation.dateFrom.getTime()) / 86_400_000) + 1;
    expect(res.body.data.totalTarget).toBe(6000 * expectedDays);
  });
});

describe("reassigning an activation's promoter (#88)", () => {
  it("the new promoter inherits the activation's targets; the previous one no longer sees them", async () => {
    const { campaign, activation, item, staff: oldStaff } = await makeCampaignWithActivation();
    await prisma.activationTarget.create({
      data: { activationId: activation.id, dateFrom: activation.dateFrom, dateTo: activation.dateTo, targetItemId: item.id, targetValue: 12000 },
    });
    const newStaff = await makeStaff();

    const patch = await request(app)
      .patch(`/admin/v1/campaigns/${campaign.id}/activations/${activation.id}`)
      .set("Authorization", `Bearer ${await adminToken()}`)
      .send({ staffId: newStaff.id });
    expect(patch.status).toBe(200);
    expect(await prisma.activationTarget.count({ where: { activationId: activation.id } })).toBe(1);

    const asNew = await request(app).get("/v1/sales-summary/today")
      .set("Authorization", `Bearer ${await staffToken(newStaff.mobileUsername, "field-pw")}`);
    expect(asNew.status).toBe(200);
    expect(asNew.body.data.target).toBe(12000);

    const perf = await request(app).get(`/v1/campaigns/${campaign.id}/performance`)
      .set("Authorization", `Bearer ${await staffToken(newStaff.mobileUsername, "field-pw")}`);
    expect(perf.status).toBe(200);
    expect(perf.body.data.totalTarget).toBeGreaterThanOrEqual(12000);

    const asOld = await request(app).get("/v1/sales-summary/today")
      .set("Authorization", `Bearer ${await staffToken(oldStaff.mobileUsername, "field-pw")}`);
    expect(asOld.body.data?.target ?? null).toBeNull();
  });
});
