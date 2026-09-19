import { describe, expect, it, beforeEach } from "vitest";
import { colomboYmd } from "../src/utils/dates";
import request from "supertest";
import { app } from "../src/app";
import { resetDb, adminToken, makeCampaignWithActivation, staffToken } from "./helpers";
import { prisma } from "../src/utils/prisma";

beforeEach(resetDb);

describe("GET /admin/v1/campaigns/:id/absence (issue #33)", () => {
  it("does not mark a staff absent when they checked in on one of their concurrent activations for the day", async () => {
    const { campaign, outlet, staff, activation } = await makeCampaignWithActivation();
    const otherOutlet = await prisma.outlet.create({
      data: { outletNo: `OO-${Math.random().toString(36).slice(2, 7)}`, name: "Outlet 2", cityId: outlet.cityId, latitude: 6.91, longitude: 79.91 },
    });
    await prisma.activation.create({
      data: { name: "Activation B", campaignId: campaign.id, outletId: otherOutlet.id, staffId: staff.id, dateFrom: campaign.startDate, dateTo: campaign.endDate },
    });

    const token = await staffToken(staff.mobileUsername, "field-pw");
    await request(app).post("/v1/attendance/check-in").set("Authorization", `Bearer ${token}`)
      .send({ assignmentId: activation.id, latitude: outlet.latitude, longitude: outlet.longitude })
      .expect(201);

    const res = await request(app).get(`/admin/v1/campaigns/${campaign.id}/absence`)
      .query({ date: colomboYmd() })
      .set("Authorization", `Bearer ${await adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((r: { staffId: string }) => r.staffId === staff.id)).toBe(false);
  });

  it("still lists a staff absent when none of their activations for the day has a check-in", async () => {
    const { campaign, staff } = await makeCampaignWithActivation();
    const res = await request(app).get(`/admin/v1/campaigns/${campaign.id}/absence`)
      .query({ date: colomboYmd() })
      .set("Authorization", `Bearer ${await adminToken()}`);
    expect(res.status).toBe(200);
    const row = res.body.data.find((r: { staffId: string }) => r.staffId === staff.id);
    expect(row).toBeTruthy();
    expect(row.staffName).toBe(staff.fullName);
    expect(row.onLeave).toBe(false);
  });
});
