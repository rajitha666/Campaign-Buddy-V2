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

  // Multi-outlet promoters — a promoter can be on two activations the same day
  // (verified in production): /me/assignments must list them both so the app can
  // offer an outlet chooser instead of /today's silent findFirst pick.
  it("returns a promoter's own activations too, including multiple same-day outlets", async () => {
    const promoter = await makeStaff();
    const promoterToken = await staffToken(promoter.mobileUsername, "field-pw");
    const client = await prisma.client.create({ data: { companyName: "Co", clientName: "C" } });
    const city = await prisma.city.create({ data: { name: "City", province: "P", district: "D" } });
    const makeOutlet = async (name: string) =>
      prisma.outlet.create({
        data: { outletNo: `O-${Math.random().toString(36).slice(2, 7)}`, name, cityId: city.id, latitude: 6.9, longitude: 79.9 },
      });
    const outletA = await makeOutlet("Outlet A");
    const outletB = await makeOutlet("Outlet B");
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
      data: { name: "First outlet", campaignId: campaign.id, outletId: outletA.id, staffId: promoter.id, dateFrom: today, dateTo: today },
    });
    await prisma.activation.create({
      data: { name: "Second outlet", campaignId: campaign.id, outletId: outletB.id, staffId: promoter.id, dateFrom: today, dateTo: today },
    });

    const res = await request(app).get("/v1/me/assignments").set("Authorization", `Bearer ${promoterToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.map((a: { outlet: { name: string } }) => a.outlet.name)).toEqual(["Outlet A", "Outlet B"]);
  });
});

// Shared setup helper for the soft-delete tests below.
const makeActivation = async (
  staffId: string,
  name: string,
  outletName: string,
  deleted: boolean,
  supervisorStaffId?: string
) => {
  const client = await prisma.client.create({ data: { companyName: "Co", clientName: "C" } });
  const city = await prisma.city.create({ data: { name: "City", province: "P", district: "D" } });
  const outlet = await prisma.outlet.create({
    data: { outletNo: `O-${Math.random().toString(36).slice(2, 7)}`, name: outletName, cityId: city.id, latitude: 6.9, longitude: 79.9 },
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
  return prisma.activation.create({
    data: {
      name, campaignId: campaign.id, outletId: outlet.id, staffId,
      ...(supervisorStaffId ? { supervisorStaffId } : {}),
      ...(deleted ? { deletedAt: new Date() } : {}),
      dateFrom: dayDate(),
      dateTo: dayDate(),
    },
  });
};

// Soft-deleted activations (deleted from CB Office) must not surface on mobile —
// verified in production: a promoter's deleted assignment kept appearing on the
// app because /me/assignments and /me/assignments/today never filtered deletedAt.
describe("GET /v1/me/assignments[/today] — soft-deleted activations hidden", () => {
  it("excludes a deleted activation from the list and keeps the live one", async () => {
    const promoter = await makeStaff();
    const token = await staffToken(promoter.mobileUsername, "field-pw");
    const deleted = await makeActivation(promoter.id, "Deleted outlet", "Outlet Deleted", true);
    const live = await makeActivation(promoter.id, "Live outlet", "Outlet Live", false);

    const res = await request(app).get("/v1/me/assignments").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].outlet.name).toBe("Outlet Live");
    expect(res.body.data[0].assignmentId).toBe(live.id);
    expect(res.body.data[0].assignmentId).not.toBe(deleted.id);
  });

  it("excludes a deleted activation from /today and 404s when nothing live remains", async () => {
    const promoter = await makeStaff();
    const token = await staffToken(promoter.mobileUsername, "field-pw");
    await makeActivation(promoter.id, "Deleted only", "Outlet Deleted", true);

    const today = await request(app).get("/v1/me/assignments/today").set("Authorization", `Bearer ${token}`);
    expect(today.status).toBe(404);
  });
});
