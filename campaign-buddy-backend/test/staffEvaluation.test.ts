import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, resetDb, adminToken, makeCampaignWithActivation } from "./helpers";
import { prisma } from "../src/utils/prisma";
import { dayDate } from "../src/utils/dates";
import { countActivationWorkingDays, workingDaysPerMonth } from "../src/utils/activationPerformance";

beforeEach(resetDb);

// Client doc B — replaces the old "attendance + min(100, totalItems)" placeholder
// with pacing against the current activation's own target, prorated by
// activation type (weekend: ÷8 working weekend days/month, monthly: ÷25).
describe("GET /admin/v1/staff/:staffId/evaluation — overallPerformancePct", () => {
  it("paces a weekend activation's target achievement against working weekend days elapsed so far", async () => {
    const { activation, item, activationItem, staff } = await makeCampaignWithActivation();
    await prisma.activation.update({ where: { id: activation.id }, data: { activationType: "weekend", targetUnit: "unit_wise" } });

    const today = dayDate();
    const periodStart = new Date(today.getTime() - 30 * 86400000);
    const periodEnd = new Date(today.getTime() + 30 * 86400000);
    const targetValue = 800;
    await prisma.activationTarget.create({
      data: { activationId: activation.id, dateFrom: periodStart, dateTo: periodEnd, targetItemId: item.id, targetValue },
    });

    const elapsedWorkingDays = countActivationWorkingDays(periodStart, today, "weekend");
    const dailyRate = targetValue / workingDaysPerMonth("weekend");
    const expectedToDate = dailyRate * elapsedWorkingDays;
    // Sell exactly the expected-to-date amount so performance should read 100%,
    // regardless of how many weekend days have actually elapsed by test time.
    const soldToday = Math.round(expectedToDate);
    await prisma.salesRecord.create({ data: { activationItemId: activationItem.id, date: today, openingStock: soldToday, soldToday } });

    const res = await request(app)
      .get(`/admin/v1/staff/${staff.id}/evaluation`)
      .set("Authorization", `Bearer ${await adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.currentActivationId).toBe(activation.id);
    const expectedPct = expectedToDate > 0 ? Math.round((soldToday / expectedToDate) * 1000) / 10 : 0;
    expect(res.body.data.overallPerformancePct).toBe(expectedPct);
  });

  it("is 0% when the current activation has no target covering today", async () => {
    const { staff } = await makeCampaignWithActivation();
    const res = await request(app)
      .get(`/admin/v1/staff/${staff.id}/evaluation`)
      .set("Authorization", `Bearer ${await adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.overallPerformancePct).toBe(0);
  });
});
