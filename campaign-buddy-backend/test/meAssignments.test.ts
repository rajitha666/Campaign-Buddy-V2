import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/utils/prisma";
import { app, resetDb, staffToken, makeStaff } from "./helpers";
import { dayDate } from "../src/utils/dates";

beforeEach(resetDb);

// #45 — me.routes.ts compared @db.Date columns against a full `new Date()`
// timestamp, so an assignment ending TODAY disappeared after midnight
// (dateTo >= now fails). Every date filter must use dayDate()'s UTC midnight.
describe("GET /v1/me/assignments/today", () => {
  it("still returns an assignment whose dateTo is today", async () => {
    const staff = await makeStaff();
    const token = await staffToken(staff.mobileUsername, "field-pw");
    const client = await prisma.client.create({ data: { companyName: "Co", clientName: "C" } });
    const city = await prisma.city.create({ data: { name: "City", province: "P", district: "D" } });
    const outlet = await prisma.outlet.create({
      data: { outletNo: `O-${Math.random().toString(36).slice(2, 7)}`, name: "Outlet", cityId: city.id, latitude: 6.9, longitude: 79.9 },
    });
    const campaign = await prisma.campaign.create({
      data: {
        campaignNo: `CMP-${Math.random().toString(36).slice(2, 7)}`,
        name: "Campaign",
        clientId: client.id,
        startDate: new Date(Date.now() - 3 * 86400000),
        endDate: new Date(Date.now() + 5 * 86400000),
      },
    });
    const today = dayDate();
    await prisma.activation.create({
      data: { name: "Last-day activation", campaignId: campaign.id, outletId: outlet.id, staffId: staff.id, dateFrom: today, dateTo: today },
    });

    const res = await request(app).get("/v1/me/assignments/today").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.campaign.id).toBe(campaign.id);
  });
});

// #63 — a supervisor's route ("today's visits") comes from GET /me/assignments,
// which only matched Activation.staffId (the promoter). A supervisor is never
// the staffId on an Activation — they're recorded in supervisorStaffId — so
// their assigned outlet visits silently never showed up on the app.
describe("GET /v1/me/assignments (supervisor mode)", () => {
  it("returns activations where the caller is the supervisor, not just the promoter", async () => {
    const promoter = await makeStaff();
    const supervisor = await makeStaff({ userType: "supervisor" });
    const supervisorToken = await staffToken(supervisor.mobileUsername, "field-pw");
    const client = await prisma.client.create({ data: { companyName: "Co", clientName: "C" } });
    const city = await prisma.city.create({ data: { name: "City", province: "P", district: "D" } });
    const outlet = await prisma.outlet.create({
      data: { outletNo: `O-${Math.random().toString(36).slice(2, 7)}`, name: "Outlet", cityId: city.id, latitude: 6.9, longitude: 79.9 },
    });
    const campaign = await prisma.campaign.create({
      data: {
        campaignNo: `CMP-${Math.random().toString(36).slice(2, 7)}`,
        name: "Campaign",
        clientId: client.id,
        startDate: new Date(Date.now() - 3 * 86400000),
        endDate: new Date(Date.now() + 5 * 86400000),
      },
    });
    const today = dayDate();
    await prisma.activation.create({
      data: {
        name: "Supervised activation", campaignId: campaign.id, outletId: outlet.id,
        staffId: promoter.id, supervisorStaffId: supervisor.id, dateFrom: today, dateTo: today,
      },
    });

    const res = await request(app).get("/v1/me/assignments").set("Authorization", `Bearer ${supervisorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].outlet.id).toBe(outlet.id);
  });

  it("does not return an activation where the caller is only the promoter", async () => {
    const promoter = await makeStaff();
    const promoterToken = await staffToken(promoter.mobileUsername, "field-pw");
    const client = await prisma.client.create({ data: { companyName: "Co", clientName: "C" } });
    const city = await prisma.city.create({ data: { name: "City", province: "P", district: "D" } });
    const outlet = await prisma.outlet.create({
      data: { outletNo: `O-${Math.random().toString(36).slice(2, 7)}`, name: "Outlet", cityId: city.id, latitude: 6.9, longitude: 79.9 },
    });
    const campaign = await prisma.campaign.create({
      data: {
        campaignNo: `CMP-${Math.random().toString(36).slice(2, 7)}`,
        name: "Campaign",
        clientId: client.id,
        startDate: new Date(Date.now() - 3 * 86400000),
        endDate: new Date(Date.now() + 5 * 86400000),
      },
    });
    const today = dayDate();
    await prisma.activation.create({
      data: { name: "Plain activation", campaignId: campaign.id, outletId: outlet.id, staffId: promoter.id, dateFrom: today, dateTo: today },
    });

    const res = await request(app).get("/v1/me/assignments").set("Authorization", `Bearer ${promoterToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});
