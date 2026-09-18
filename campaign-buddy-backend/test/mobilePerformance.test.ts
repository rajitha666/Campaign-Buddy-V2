import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/utils/prisma";
import { app, resetDb, staffToken, makeCampaignWithActivation } from "./helpers";

beforeEach(resetDb);

describe("GET /v1/campaigns/:id/performance — day counters (#53)", () => {
  it("totalDays excludes weekends rather than counting every calendar day", async () => {
    const { campaign, outlet, activation, staff } = await makeCampaignWithActivation();

    // 2026-09-03 (Thu) to 2026-10-03 (Sat): 31 calendar days, 22 working days.
    const dateFrom = new Date("2026-09-03T00:00:00.000Z");
    const dateTo = new Date("2026-10-03T00:00:00.000Z");
    await prisma.activation.update({ where: { id: activation.id }, data: { dateFrom, dateTo } });

    const token = await staffToken(staff.mobileUsername, "field-pw");
    const res = await request(app)
      .get(`/v1/campaigns/${campaign.id}/performance`)
      .query({ outletId: outlet.id })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.totalDays).toBe(22);
  });

  it("counts Sat/Sun instead of Mon-Fri when the activation is weekend-type (client doc B)", async () => {
    const { campaign, outlet, activation, staff } = await makeCampaignWithActivation();

    // Same range as above: 31 calendar days, 22 weekdays, 9 weekend days.
    const dateFrom = new Date("2026-09-03T00:00:00.000Z");
    const dateTo = new Date("2026-10-03T00:00:00.000Z");
    await prisma.activation.update({ where: { id: activation.id }, data: { dateFrom, dateTo, activationType: "weekend" } });

    const token = await staffToken(staff.mobileUsername, "field-pw");
    const res = await request(app)
      .get(`/v1/campaigns/${campaign.id}/performance`)
      .query({ outletId: outlet.id })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.totalDays).toBe(9);
  });
});
