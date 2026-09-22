import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { prisma } from "../src/utils/prisma";
import { app, resetDb, adminToken, staffToken, makeCampaignWithActivation } from "./helpers";
import { dayDate } from "../src/utils/dates";

beforeEach(resetDb);

// #91 — the first stock update after check-in is the day's starting stock.
describe("starting stock snapshot on the first stock update after check-in", () => {
  async function checkedIn() {
    const f = await makeCampaignWithActivation();
    const auth = { Authorization: `Bearer ${await staffToken(f.staff.mobileUsername, "field-pw")}` };
    await request(app).post("/v1/attendance/check-in").set(auth).send({ latitude: f.outlet.latitude, longitude: f.outlet.longitude }).expect(201);
    const stock = (body: object) => request(app).patch(`/v1/products/${f.activationItem.id}/stock`).set(auth).send(body);
    return { ...f, auth, stock };
  }

  it("records the opening stock of the first update and keeps it through a mid-day restock", async () => {
    const f = await checkedIn();
    await f.stock({ openingStock: 50, soldToday: 5 }).expect(200);
    await f.stock({ openingStock: 80 }).expect(200); // restock

    const rec = await prisma.salesRecord.findFirstOrThrow({ where: { activationItemId: f.activationItem.id } });
    expect(rec.openingStock).toBe(80);
    expect(rec.startingStock).toBe(50);
  });

  it("does not backfill a record that already existed without a snapshot", async () => {
    const f = await checkedIn();
    await prisma.salesRecord.create({ data: { activationItemId: f.activationItem.id, date: dayDate(), openingStock: 10 } });
    await f.stock({ openingStock: 30 }).expect(200);

    const rec = await prisma.salesRecord.findFirstOrThrow({ where: { activationItemId: f.activationItem.id } });
    expect(rec.startingStock).toBeNull();
  });
});

describe("GET /admin/v1/campaigns/:id/reports/starting-stock", () => {
  async function fixture() {
    const f = await makeCampaignWithActivation();
    const day = dayDate();
    await prisma.salesRecord.create({ data: { activationItemId: f.activationItem.id, date: day, openingStock: 80, startingStock: 50, soldToday: 5 } });
    return { ...f, day };
  }

  it("lists date, outlet, promoter, product, unit price and start qty", async () => {
    const f = await fixture();
    const res = await request(app)
      .get(`/admin/v1/campaigns/${f.campaign.id}/reports/starting-stock`)
      .set("Authorization", `Bearer ${await adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0]).toEqual({
      date: f.day.toISOString().slice(0, 10),
      outletName: f.outlet.name,
      promoterName: f.staff.fullName,
      itemName: f.item.name,
      unitPrice: f.item.unitPrice,
      startQty: 50,
    });
  });

  it("leaves out days with no snapshot (pre-feature rows) and honours the date filter", async () => {
    const f = await fixture();
    const yesterday = new Date(f.day.getTime() - 86400000);
    await prisma.salesRecord.create({ data: { activationItemId: f.activationItem.id, date: yesterday, openingStock: 40 } });
    const auth = `Bearer ${await adminToken()}`;

    const all = await request(app).get(`/admin/v1/campaigns/${f.campaign.id}/reports/starting-stock`).set("Authorization", auth);
    expect(all.body.data).toHaveLength(1);

    const other = await request(app)
      .get(`/admin/v1/campaigns/${f.campaign.id}/reports/starting-stock`)
      .query({ dateFrom: yesterday.toISOString().slice(0, 10), dateTo: yesterday.toISOString().slice(0, 10) })
      .set("Authorization", auth);
    expect(other.body.data).toHaveLength(0);
  });

  it("only shows a scoped viewer the outlets they have been granted", async () => {
    const f = await fixture();
    const otherOutlet = await prisma.outlet.create({
      data: { outletNo: `O-${Math.random().toString(36).slice(2, 7)}`, name: "Other outlet", cityId: f.city.id, latitude: 7.1, longitude: 80.1 },
    });
    const user = await prisma.user.create({
      data: { username: "client1", passwordHash: await bcrypt.hash("cl-pw", 4), displayName: "Client", roleId: "sponsor" },
    });
    await prisma.campaignAccessGrant.create({ data: { userId: user.id, campaignId: f.campaign.id, scopeType: "subset", outletIds: [otherOutlet.id] } });
    const login = await request(app).post("/admin/v1/auth/login").send({ username: "client1", password: "cl-pw" });

    const res = await request(app)
      .get(`/admin/v1/campaigns/${f.campaign.id}/reports/starting-stock`)
      .set("Authorization", `Bearer ${login.body.data.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});
