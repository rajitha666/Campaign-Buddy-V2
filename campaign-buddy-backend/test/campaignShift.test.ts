import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, resetDb, adminToken, makeCampaignWithActivation, makeStaff } from "./helpers";
import { prisma } from "../src/utils/prisma";

// Enhancement: per-campaign shift window (default 09:00-18:00 local),
// editable by a Campaign Admin from CB Office, with an optional per-activation
// override — see src/utils/attendanceWindow.ts.

beforeEach(resetDb);

describe("Campaign shift window — defaults + admin edits", () => {
  it("defaults a new campaign to 09:00-18:00 (540/1080 minutes) when not specified", async () => {
    const token = await adminToken();
    const client = await prisma.client.create({ data: { companyName: "Co", clientName: "C" } });
    const res = await request(app)
      .post("/admin/v1/campaigns")
      .set("Authorization", `Bearer ${token}`)
      .send({ campaignNo: "CMP-SHIFT-1", name: "Shift Test", clientId: client.id, startDate: "2026-10-01", endDate: "2026-10-31" });
    expect(res.status).toBe(201);
    expect(res.body.data.shiftStartMinutes).toBe(540);
    expect(res.body.data.shiftEndMinutes).toBe(1080);
  });

  it("accepts an explicit shift window on create", async () => {
    const token = await adminToken();
    const client = await prisma.client.create({ data: { companyName: "Co", clientName: "C" } });
    const res = await request(app)
      .post("/admin/v1/campaigns")
      .set("Authorization", `Bearer ${token}`)
      .send({ campaignNo: "CMP-SHIFT-2", name: "Shift Test 2", clientId: client.id, startDate: "2026-10-01", endDate: "2026-10-31", shiftStartMinutes: 480, shiftEndMinutes: 1020 });
    expect(res.status).toBe(201);
    expect(res.body.data.shiftStartMinutes).toBe(480);
    expect(res.body.data.shiftEndMinutes).toBe(1020);
  });

  it("lets a Campaign Admin edit the shift window via PATCH", async () => {
    const token = await adminToken();
    const { campaign } = await makeCampaignWithActivation();

    const res = await request(app)
      .patch(`/admin/v1/campaigns/${campaign.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ shiftStartMinutes: 450, shiftEndMinutes: 1110 }); // 07:30-18:30
    expect(res.status).toBe(200);
    expect(res.body.data.shiftStartMinutes).toBe(450);
    expect(res.body.data.shiftEndMinutes).toBe(1110);

    const updated = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    expect(updated.shiftStartMinutes).toBe(450);
    expect(updated.shiftEndMinutes).toBe(1110);
  });

  it("rejects an out-of-range shift value", async () => {
    const token = await adminToken();
    const { campaign } = await makeCampaignWithActivation();
    const res = await request(app)
      .patch(`/admin/v1/campaigns/${campaign.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ shiftStartMinutes: 1500 });
    expect(res.status).toBe(400);
  });
});

describe("Activation shift override", () => {
  it("sets and clears a per-activation shift override", async () => {
    const token = await adminToken();
    const { campaign, activation } = await makeCampaignWithActivation();

    const set = await request(app)
      .patch(`/admin/v1/campaigns/${campaign.id}/activations/${activation.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ shiftStartMinutes: 600, shiftEndMinutes: 960 });
    expect(set.status).toBe(200);
    expect(set.body.data.shiftStartMinutes).toBe(600);
    expect(set.body.data.shiftEndMinutes).toBe(960);

    const cleared = await request(app)
      .patch(`/admin/v1/campaigns/${campaign.id}/activations/${activation.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ shiftStartMinutes: null, shiftEndMinutes: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data.shiftStartMinutes).toBeNull();
    expect(cleared.body.data.shiftEndMinutes).toBeNull();
  });

  it("accepts a shift override on activation create", async () => {
    const token = await adminToken();
    const { campaign, outlet } = await makeCampaignWithActivation();
    const promoter = await makeStaff();

    const res = await request(app)
      .post(`/admin/v1/campaigns/${campaign.id}/activations`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Early shift",
        outletId: outlet.id,
        staffId: promoter.id,
        dateFrom: "2026-10-01",
        dateTo: "2026-10-31",
        shiftStartMinutes: 360,
        shiftEndMinutes: 780,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.shiftStartMinutes).toBe(360);
    expect(res.body.data.shiftEndMinutes).toBe(780);
  });
});
