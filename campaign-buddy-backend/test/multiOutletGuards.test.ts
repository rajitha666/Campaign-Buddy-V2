import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/utils/prisma";
import { app, resetDb, staffToken, makeStaff } from "./helpers";
import { dayDate } from "../src/utils/dates";

beforeEach(resetDb);

// Release-gate regression for multi-outlet promoters + soft-deleted activations.
// The first pass of multi-outlet work added ?assignmentId= to stats / sales-summary
// and hid deleted activations on /me/*; these pin the guarantees that must hold
// on EVERY promoter route, not just the ones that were touched.
async function seed() {
  const promoter = await makeStaff();
  const other = await makeStaff();
  const token = await staffToken(promoter.mobileUsername, "field-pw");
  const otherToken = await staffToken(other.mobileUsername, "field-pw");
  const client = await prisma.client.create({ data: { companyName: "Co", clientName: "C" } });
  const brand = await prisma.brand.create({ data: { name: "B", clientId: client.id } });
  const item = await prisma.item.create({ data: { brandId: brand.id, sku: "SKU-9", name: "Item 9", unitPrice: 500 } });
  const city = await prisma.city.create({ data: { name: "City", province: "P", district: "D" } });
  const makeOutlet = (name: string) =>
    prisma.outlet.create({
      data: { outletNo: `O-${Math.random().toString(36).slice(2, 7)}`, name, cityId: city.id, latitude: 6.9, longitude: 79.9 },
    });
  const [outletA, outletB] = await Promise.all([makeOutlet("Outlet A"), makeOutlet("Outlet B")]);
  const campaign = await prisma.campaign.create({
    data: {
      campaignNo: `CMP-${Math.random().toString(36).slice(2, 7)}`,
      name: "Campaign",
      clientId: client.id,
      startDate: new Date(Date.now() - 5 * 86400000),
      endDate: new Date(Date.now() + 5 * 86400000),
    },
  });
  const campaignItem = await prisma.campaignItem.create({ data: { campaignId: campaign.id, itemId: item.id } });
  const today = dayDate();
  const mk = async (outletId: string, staffId: string, extra: Record<string, unknown> = {}) => {
    const a = await prisma.activation.create({
      data: { name: "Act", campaignId: campaign.id, outletId, staffId, dateFrom: today, dateTo: today, ...extra },
    });
    const ai = await prisma.activationItem.create({ data: { activationId: a.id, campaignItemId: campaignItem.id } });
    return { a, ai };
  };
  const A = await mk(outletA.id, promoter.id);
  const B = await mk(outletB.id, promoter.id);
  const auth = { Authorization: `Bearer ${token}` };
  const geoA = { latitude: outletA.latitude, longitude: outletA.longitude };
  const geoB = { latitude: outletB.latitude, longitude: outletB.longitude };
  return { promoter, other, token, otherToken, auth, campaign, outletA, outletB, A, B, mk, today, geoA, geoB };
}

const open = (activationId: string, staffId: string, date: Date) =>
  prisma.attendanceRecord.create({ data: { activationId, staffId, date, checkInAt: new Date() } });

describe("multi-outlet promoter — one shift at a time", () => {
  it("cannot check in at outlet B while a shift is open at outlet A", async () => {
    const { auth, A, B, geoA, geoB } = await seed();
    const inA = await request(app).post("/v1/attendance/check-in").set(auth).send({ assignmentId: A.a.id, ...geoA });
    expect(inA.status).toBe(201);
    const inB = await request(app).post("/v1/attendance/check-in").set(auth).send({ assignmentId: B.a.id, ...geoB });
    expect(inB.status).toBe(409);
    expect(inB.body.error.code).toBe("ALREADY_CHECKED_IN");
  });

  it("per-assignment attendance/today reflects only that outlet's shift", async () => {
    const { auth, A, B, geoA } = await seed();
    await request(app).post("/v1/attendance/check-in").set(auth).send({ assignmentId: A.a.id, ...geoA });
    const a = await request(app).get(`/v1/attendance/today?assignmentId=${A.a.id}`).set(auth);
    const b = await request(app).get(`/v1/attendance/today?assignmentId=${B.a.id}`).set(auth);
    expect(a.body.data.checkedIn).toBe(true);
    expect(b.body.data.checkedIn).toBe(false);
  });

  it("stats and stock edits at outlet B are refused while only outlet A is checked in", async () => {
    const { auth, promoter, A, B, today } = await seed();
    await open(A.a.id, promoter.id, today);
    const stats = await request(app).patch(`/v1/stats/today?assignmentId=${B.a.id}`).set(auth).send({ footFall: 3 });
    expect(stats.status).toBe(422);
    expect(stats.body.error.code).toBe("NOT_CHECKED_IN");
    const stock = await request(app)
      .patch(`/v1/products/${B.ai.id}/stock`)
      .set(auth)
      .send({ openingStock: 10, soldToday: 1 });
    expect(stock.status).toBe(422);
    expect(stock.body.error.code).toBe("NOT_CHECKED_IN");
    expect(await prisma.dailyStats.count({ where: { activationId: B.a.id } })).toBe(0);
  });

  it("stock sold at outlet A does not leak into outlet B's summary", async () => {
    const { auth, promoter, A, B, today } = await seed();
    await open(A.a.id, promoter.id, today);
    const put = await request(app)
      .patch(`/v1/products/${A.ai.id}/stock`)
      .set(auth)
      .send({ openingStock: 10, soldToday: 4 });
    expect(put.status).toBe(200);
    const a = await request(app).get(`/v1/sales-summary/today?assignmentId=${A.a.id}`).set(auth);
    const b = await request(app).get(`/v1/sales-summary/today?assignmentId=${B.a.id}`).set(auth);
    expect(a.body.data.totalSales).toBe(2000);
    expect(b.body.data.totalSales).toBe(0);
  });
});

describe("promoter checks out of one outlet then works the next (documented flow)", () => {
  // docs/api-spec.md, /me/assignments: "the rep checks into one outlet, checks
  // out, then checks into the next." The outlet chooser exists precisely for this.
  it("can check in at outlet B after checking out of outlet A on the same day", async () => {
    const { auth, A, B, geoA, geoB } = await seed();
    expect((await request(app).post("/v1/attendance/check-in").set(auth).send({ assignmentId: A.a.id, ...geoA })).status).toBe(201);
    expect((await request(app).post("/v1/attendance/check-out").set(auth).send({ assignmentId: A.a.id, ...geoA })).status).toBe(200);
    const inB = await request(app).post("/v1/attendance/check-in").set(auth).send({ assignmentId: B.a.id, ...geoB });
    expect(inB.status).toBe(201);
    expect(inB.body.data.assignmentId).toBe(B.a.id);
  });

  it("still cannot re-open the SAME outlet after checking out of it", async () => {
    const { auth, A, geoA } = await seed();
    await request(app).post("/v1/attendance/check-in").set(auth).send({ assignmentId: A.a.id, ...geoA });
    await request(app).post("/v1/attendance/check-out").set(auth).send({ assignmentId: A.a.id, ...geoA });
    const again = await request(app).post("/v1/attendance/check-in").set(auth).send({ assignmentId: A.a.id, ...geoA });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("ALREADY_CHECKED_OUT");
  });
});

describe("soft-deleted activations are unusable on every promoter route", () => {
  it("cannot be checked in to (explicit id or implicit pick)", async () => {
    const { auth, A, B, geoA } = await seed();
    await prisma.activation.updateMany({ where: { id: { in: [A.a.id, B.a.id] } }, data: { deletedAt: new Date() } });
    const explicit = await request(app).post("/v1/attendance/check-in").set(auth).send({ assignmentId: A.a.id, ...geoA });
    expect(explicit.status).toBe(404);
    const implicit = await request(app).post("/v1/attendance/check-in").set(auth).send(geoA);
    expect(implicit.status).toBe(404);
    expect(await prisma.attendanceRecord.count()).toBe(0);
  });

  it("implicit check-in skips the deleted activation and uses the live one", async () => {
    const { auth, A, B, geoA } = await seed();
    await prisma.activation.update({ where: { id: A.a.id }, data: { deletedAt: new Date() } });
    await prisma.activation.update({ where: { id: B.a.id }, data: { name: "live" } });
    const res = await request(app).post("/v1/attendance/check-in").set(auth).send(geoA);
    expect(res.status).toBe(201);
    expect(res.body.data.assignmentId).toBe(B.a.id);
  });

  it("stats / sales-summary / products cannot read or write it", async () => {
    const { auth, promoter, campaign, outletA, A, B, today } = await seed();
    await open(A.a.id, promoter.id, today);
    await prisma.activation.update({ where: { id: A.a.id }, data: { deletedAt: new Date() } });

    const statsWrite = await request(app).patch(`/v1/stats/today?assignmentId=${A.a.id}`).set(auth).send({ footFall: 9 });
    expect(statsWrite.status).toBe(422);
    const summary = await request(app).get(`/v1/sales-summary/today?assignmentId=${A.a.id}`).set(auth);
    expect(summary.status).toBe(404);
    // With A deleted the implicit pick falls to the still-live B ...
    const fallsToLive = await request(app).get("/v1/sales-summary/today").set(auth);
    expect(fallsToLive.status).toBe(200);
    expect(fallsToLive.body.data.assignmentId).toBe(B.a.id);
    // ... and once nothing live remains there is nothing to summarise.
    await prisma.activation.update({ where: { id: B.a.id }, data: { deletedAt: new Date() } });
    const summaryImplicit = await request(app).get("/v1/sales-summary/today").set(auth);
    expect(summaryImplicit.status).toBe(404);
    const products = await request(app).get(`/v1/campaigns/${campaign.id}/outlets/${outletA.id}/products`).set(auth);
    expect(products.status).toBe(404);
    expect(await prisma.dailyStats.count()).toBe(0);
  });

  it("stock edits against its activation items are refused", async () => {
    const { auth, promoter, A, today } = await seed();
    await open(A.a.id, promoter.id, today);
    await prisma.activation.update({ where: { id: A.a.id }, data: { deletedAt: new Date() } });
    const res = await request(app).patch(`/v1/products/${A.ai.id}/stock`).set(auth).send({ openingStock: 5, soldToday: 1 });
    expect(res.status).toBe(404);
  });
});

describe("?assignmentId= is scoped to the caller and to today", () => {
  it("another promoter's assignment id reads as empty and cannot be written", async () => {
    const { otherToken, A, today, promoter } = await seed();
    await open(A.a.id, promoter.id, today);
    const oa = { Authorization: `Bearer ${otherToken}` };
    const read = await request(app).get(`/v1/stats/today?assignmentId=${A.a.id}`).set(oa);
    expect(read.body.data.footFall).toBe(0);
    const write = await request(app).patch(`/v1/stats/today?assignmentId=${A.a.id}`).set(oa).send({ footFall: 99 });
    expect(write.status).toBe(422);
    const sum = await request(app).get(`/v1/sales-summary/today?assignmentId=${A.a.id}`).set(oa);
    expect(sum.status).toBe(404);
    const stock = await request(app).patch(`/v1/products/${A.ai.id}/stock`).set(oa).send({ openingStock: 5, soldToday: 1 });
    expect([403, 404, 422]).toContain(stock.status);
    expect(await prisma.dailyStats.count()).toBe(0);
  });

  it("an activation that ended yesterday cannot be targeted for today's stats", async () => {
    const { auth, promoter, mk, today } = await seed();
    const yesterday = new Date(today.getTime() - 86400000);
    const city = await prisma.city.findFirstOrThrow();
    const outlet = await prisma.outlet.create({
      data: { outletNo: "O-OLD", name: "Old", cityId: city.id, latitude: 6.9, longitude: 79.9 },
    });
    const old = await mk(outlet.id, promoter.id, { dateFrom: yesterday, dateTo: yesterday });
    await open(old.a.id, promoter.id, today);
    const res = await request(app).patch(`/v1/stats/today?assignmentId=${old.a.id}`).set(auth).send({ footFall: 5 });
    expect(res.status).toBe(422);
    const sum = await request(app).get(`/v1/sales-summary/today?assignmentId=${old.a.id}`).set(auth);
    expect(sum.status).toBe(404);
  });
});

describe("GET /v1/me/assignments — date window and ownership", () => {
  it("lists only today's live assignments of the caller, sorted by outlet", async () => {
    const { auth, promoter, other, A, B, mk, outletA, today } = await seed();
    const yesterday = new Date(today.getTime() - 86400000);
    const tomorrow = new Date(today.getTime() + 86400000);
    await mk(outletA.id, promoter.id, { dateFrom: yesterday, dateTo: yesterday });
    await mk(outletA.id, promoter.id, { dateFrom: tomorrow, dateTo: tomorrow });
    await mk(outletA.id, other.id);
    const res = await request(app).get("/v1/me/assignments").set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data.map((r: { assignmentId: string }) => r.assignmentId).sort()).toEqual([A.a.id, B.a.id].sort());
    expect(res.body.data.map((r: { outlet: { name: string } }) => r.outlet.name)).toEqual(["Outlet A", "Outlet B"]);
  });

  it("an admin soft-deleting one of two outlets leaves the other selectable", async () => {
    const { auth, A, B } = await seed();
    await prisma.activation.update({ where: { id: B.a.id }, data: { deletedAt: new Date() } });
    const res = await request(app).get("/v1/me/assignments").set(auth);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].assignmentId).toBe(A.a.id);
  });
});

describe("performance & stats/range ignore soft-deleted activations", () => {
  it("a deleted activation's sales are not counted in the promoter's own performance", async () => {
    const { auth, campaign, outletA, A, today } = await seed();
    await prisma.salesRecord.create({
      data: { activationItemId: A.ai.id, date: today, openingStock: 10, soldToday: 3 },
    });
    await prisma.activation.update({ where: { id: A.a.id }, data: { deletedAt: new Date() } });
    const perf = await request(app)
      .get(`/v1/campaigns/${campaign.id}/performance?outletId=${outletA.id}`)
      .set(auth);
    expect(perf.status).toBe(200);
    expect(perf.body.data.totalUnitsSold).toBe(0);
  });
});
