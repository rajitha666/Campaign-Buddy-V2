import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, resetDb, staffToken, makeCampaignWithActivation, confirmSales } from "./helpers";
import { dayDate } from "../src/utils/dates";
import { prisma } from "../src/utils/prisma";

beforeEach(resetDb);

// A promoter records data offline DURING the shift; it reaches the server after the shift has
// closed (their own check-out, or the end-of-day auto-checkout). The write carries `capturedAt`
// — when it was really made — and is accepted only if that falls inside the shift.
describe("sales writes delivered after the shift closed (offline sync)", () => {
  const mid = (a: number, b: number) => new Date((a + b) / 2);

  async function closedShift() {
    const { staff, outlet, activation, activationItem } = await makeCampaignWithActivation();
    const auth = { Authorization: `Bearer ${await staffToken(staff.mobileUsername, "field-pw")}` };
    const geo = { latitude: outlet.latitude, longitude: outlet.longitude };
    const inAt = mid(dayDate().getTime(), Date.now());
    await request(app).post("/v1/attendance/check-in").set(auth).send({ ...geo, capturedAt: inAt.toISOString() }).expect(201);
    await confirmSales(activation.id);
    await request(app).post("/v1/attendance/check-out").set(auth).send(geo).expect(200);
    return { auth, inAt, outAt: new Date(), activation, activationItem };
  }

  it("accepts a stats write captured inside the closed shift", async () => {
    const { auth, inAt, outAt } = await closedShift();
    const during = mid(inAt.getTime(), outAt.getTime());
    const res = await request(app).patch("/v1/stats/today").set(auth).send({ footFall: 9, capturedAt: during.toISOString() });
    expect(res.status).toBe(200);
    expect(res.body.data.footFall).toBe(9);
  });

  it("still refuses it with no capturedAt (an ordinary write after check-out)", async () => {
    const { auth } = await closedShift();
    const res = await request(app).patch("/v1/stats/today").set(auth).send({ footFall: 9 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("NOT_CHECKED_IN");
  });

  it("refuses a capturedAt from before the check-in", async () => {
    const { auth, inAt } = await closedShift();
    const res = await request(app)
      .patch("/v1/stats/today")
      .set(auth)
      .send({ footFall: 9, capturedAt: new Date(inAt.getTime() - 60_000).toISOString() });
    expect(res.status).toBe(422);
  });

  it("refuses a capturedAt from after the check-out", async () => {
    const { auth, outAt } = await closedShift();
    const res = await request(app)
      .patch("/v1/stats/today")
      .set(auth)
      .send({ footFall: 9, capturedAt: new Date(outAt.getTime() + 60_000).toISOString() });
    expect(res.status).toBe(422);
  });

  it("never opens the door to someone who never checked in", async () => {
    const { staff } = await makeCampaignWithActivation();
    const auth = { Authorization: `Bearer ${await staffToken(staff.mobileUsername, "field-pw")}` };
    const res = await request(app)
      .patch("/v1/stats/today")
      .set(auth)
      .send({ footFall: 9, capturedAt: new Date().toISOString() });
    expect(res.status).toBe(422);
  });

  it("applies to stock and to the daily sales summary too", async () => {
    const { auth, inAt, outAt, activation, activationItem } = await closedShift();
    const during = mid(inAt.getTime(), outAt.getTime()).toISOString();
    // Check-out needs a confirmed summary, which locks further edits; the office reopening it is what lets a late edit through.
    await prisma.salesSummary.updateMany({ where: { activationId: activation.id }, data: { confirmed: false } });
    await request(app)
      .patch(`/v1/products/${activationItem.id}/stock`)
      .set(auth)
      .send({ openingStock: 10, soldToday: 2, capturedAt: during })
      .expect(200);
    await request(app).patch("/v1/sales-summary/today").set(auth).send({ remarks: "busy day", capturedAt: during }).expect(200);
    await request(app).patch("/v1/sales-summary/today").set(auth).send({ remarks: "x" }).expect(422);
  });
});
