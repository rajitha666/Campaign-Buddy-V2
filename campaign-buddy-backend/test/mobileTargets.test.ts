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

describe("daily vs monthly target categorisation (#86)", () => {
  async function withTarget(categorization: "daily" | "monthly", unit: "unit_wise" | "sales_wise", value: number) {
    const f = await makeCampaignWithActivation();
    await prisma.activation.update({ where: { id: f.activation.id }, data: { targetCategorization: categorization, targetUnit: unit } });
    await prisma.activationTarget.create({
      data: { activationId: f.activation.id, dateFrom: f.activation.dateFrom, dateTo: f.activation.dateTo, targetItemId: f.item.id, targetValue: value },
    });
    const auth = { Authorization: `Bearer ${await staffToken(f.staff.mobileUsername, "field-pw")}` };
    return { ...f, auth };
  }

  it("a daily activation reports the daily target, with its categorisation and unit", async () => {
    const f = await withTarget("daily", "sales_wise", 6000);
    const summary = await request(app).get("/v1/sales-summary/today").set(f.auth);
    expect(summary.body.data).toMatchObject({ target: 6000, targetCategorization: "daily", targetUnit: "sales_wise" });

    const perf = await request(app).get(`/v1/campaigns/${f.campaign.id}/performance`).query({ outletId: f.outlet.id }).set(f.auth);
    const days = Math.round((f.activation.dateTo.getTime() - f.activation.dateFrom.getTime()) / 86_400_000) + 1;
    expect(perf.body.data).toMatchObject({ target: 6000, targetCategorization: "daily", targetUnit: "sales_wise", totalTarget: 6000 * days });
  });

  it("a monthly activation reports the monthly figure as entered — not multiplied out per day", async () => {
    const f = await withTarget("monthly", "unit_wise", 150000);
    const summary = await request(app).get("/v1/sales-summary/today").set(f.auth);
    expect(summary.body.data).toMatchObject({ target: 150000, targetCategorization: "monthly", targetUnit: "unit_wise" });

    const perf = await request(app).get(`/v1/campaigns/${f.campaign.id}/performance`).query({ outletId: f.outlet.id }).set(f.auth);
    expect(perf.body.data).toMatchObject({ target: 150000, targetCategorization: "monthly", targetUnit: "unit_wise", totalTarget: 150000 });
  });

  it("carries the categorisation even when no target is set (target stays null)", async () => {
    const f = await makeCampaignWithActivation();
    await prisma.activation.update({ where: { id: f.activation.id }, data: { targetCategorization: "monthly" } });
    const auth = { Authorization: `Bearer ${await staffToken(f.staff.mobileUsername, "field-pw")}` };
    const summary = await request(app).get("/v1/sales-summary/today").set(auth);
    expect(summary.body.data).toMatchObject({ target: null, targetCategorization: "monthly" });
  });
});
