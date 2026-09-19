import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/utils/prisma";
import { app, resetDb, staffToken, makeStaff } from "./helpers";
import { dayDate } from "../src/utils/dates";

beforeEach(resetDb);

// Multi-outlet promoters: a promoter can hold two same-day Activations, so
// stats/sales-summary must accept ?assignmentId= to target the chosen outlet
// instead of silently findFirst'ing the first activation, or footfall/sales
// edits would land on the other outlet (attendance already accepts the param).
async function seedTwoOutlets() {
  const promoter = await makeStaff();
  const token = await staffToken(promoter.mobileUsername, "field-pw");
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
  const [a, b] = await Promise.all([
    prisma.activation.create({ data: { name: "Outlet A", campaignId: campaign.id, outletId: outletA.id, staffId: promoter.id, dateFrom: today, dateTo: today } }),
    prisma.activation.create({ data: { name: "Outlet B", campaignId: campaign.id, outletId: outletB.id, staffId: promoter.id, dateFrom: today, dateTo: today } }),
  ]);
  return { promoter, token, activationA: a, activationB: b, today };
}

describe("GET /v1/stats/today?assignmentId=", () => {
  it("scopes to the chosen activation", async () => {
    const { token, activationA, activationB, today } = await seedTwoOutlets();
    // footfall data only on outlet B's activation
    await prisma.dailyStats.create({
      data: { activationId: activationB.id, date: today, footFall: 44, approached: 20, converted: 7 },
    });

    const res = await request(app)
      .get(`/v1/stats/today?assignmentId=${activationB.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.footFall).toBe(44);

    const resA = await request(app)
      .get(`/v1/stats/today?assignmentId=${activationA.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(resA.status).toBe(200);
    expect(resA.body.data.footFall).toBe(0);
  });
});

describe("PATCH /v1/stats/today?assignmentId=", () => {
  it("writes stats to the chosen activation, not the first one", async () => {
    const { promoter, token, activationA, activationB, today } = await seedTwoOutlets();
    // Sales edits need an open shift AT the chosen outlet (one-open-shift lock).
    await prisma.attendanceRecord.create({
      data: { activationId: activationB.id, staffId: promoter.id, date: today, checkInAt: new Date() },
    });

    const res = await request(app)
      .patch(`/v1/stats/today?assignmentId=${activationB.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ footFall: 5, approached: 3, converted: 1 });
    expect(res.status).toBe(200);

    const stats = await prisma.dailyStats.findUnique({
      where: { activationId_date: { activationId: activationB.id, date: today } },
    });
    expect(stats?.footFall).toBe(5);
    const statsA = await prisma.dailyStats.findUnique({
      where: { activationId_date: { activationId: activationA.id, date: today } },
    });
    expect(statsA).toBeNull();
  });
});

describe("GET /v1/sales-summary/today?assignmentId=", () => {
  it("returns the chosen activation's summary", async () => {
    const { token, activationA, activationB, today } = await seedTwoOutlets();
    await prisma.salesSummary.create({
      data: { activationId: activationB.id, date: today, remarks: "outlet b summary" },
    });

    const res = await request(app)
      .get(`/v1/sales-summary/today?assignmentId=${activationB.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.assignmentId).toBe(activationB.id);
    expect(res.body.data.remarks).toBe("outlet b summary");

    const resA = await request(app)
      .get(`/v1/sales-summary/today?assignmentId=${activationA.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(resA.status).toBe(200);
    expect(resA.body.data.assignmentId).toBe(activationA.id);
  });
});
