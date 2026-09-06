import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, resetDb, staffToken, makeCampaignWithActivation, makeStaff } from "./helpers";
import { prisma } from "../src/utils/prisma";

beforeEach(resetDb);

describe("attendance — geofence soft flag (§5.6)", () => {
  it("check-in succeeds inside AND outside the geofence; only checkInLocationVerified differs", async () => {
    const { staff, outlet } = await makeCampaignWithActivation();
    const token = await staffToken(staff.mobileUsername, "field-pw");

    const outside = await request(app)
      .post("/v1/attendance/check-in")
      .set("Authorization", `Bearer ${token}`)
      .send({ latitude: outlet.latitude + 0.05, longitude: outlet.longitude + 0.05 });
    expect(outside.status).toBe(201);
    expect(outside.body.data.checkInLocationVerified).toBe(false);
    expect(outside.body.data.assignmentId).toBeTypeOf("string");

    await request(app).post("/v1/attendance/check-out").set("Authorization", `Bearer ${token}`).send({});

    const inside = await request(app)
      .post("/v1/attendance/check-in")
      .set("Authorization", `Bearer ${token}`)
      .send({ latitude: outlet.latitude, longitude: outlet.longitude });
    expect(inside.status).toBe(201);
    expect(inside.body.data.checkInLocationVerified).toBe(true);
  });
});

describe("attendance — global one-open-shift lock (§5.1)", () => {
  it("a second check-in while checked in is a 409", async () => {
    const { staff, outlet } = await makeCampaignWithActivation();
    const token = await staffToken(staff.mobileUsername, "field-pw");
    await request(app).post("/v1/attendance/check-in").set("Authorization", `Bearer ${token}`).send({ latitude: outlet.latitude, longitude: outlet.longitude });
    const again = await request(app).post("/v1/attendance/check-in").set("Authorization", `Bearer ${token}`).send({ latitude: outlet.latitude, longitude: outlet.longitude });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("ALREADY_CHECKED_IN");
  });

  it("re-check-in after check-out clears checkOutAt and the lock still holds", async () => {
    const { staff, outlet } = await makeCampaignWithActivation();
    const token = await staffToken(staff.mobileUsername, "field-pw");
    const auth = { Authorization: `Bearer ${token}` };
    const geo = { latitude: outlet.latitude, longitude: outlet.longitude };

    await request(app).post("/v1/attendance/check-in").set(auth).send(geo);
    await request(app).post("/v1/attendance/check-out").set(auth).send(geo);
    const reIn = await request(app).post("/v1/attendance/check-in").set(auth).send(geo);
    expect(reIn.status).toBe(201);
    expect(reIn.body.data.checkOutAt).toBeNull();

    const again = await request(app).post("/v1/attendance/check-in").set(auth).send(geo);
    expect(again.status).toBe(409);
  });
});

describe("attendance — mobile response shapes", () => {
  it("GET /v1/attendance/today returns the slim view", async () => {
    const { staff, outlet } = await makeCampaignWithActivation();
    const token = await staffToken(staff.mobileUsername, "field-pw");
    await request(app).post("/v1/attendance/check-in").set("Authorization", `Bearer ${token}`).send({ latitude: outlet.latitude, longitude: outlet.longitude });

    const today = await request(app).get("/v1/attendance/today").set("Authorization", `Bearer ${token}`);
    expect(today.body.data).toMatchObject({ checkedIn: true, locationVerified: true, status: expect.any(String) });
    expect(today.body.data.shiftDurationSeconds).toBeGreaterThanOrEqual(0);
  });

  it("location ping accepts `timestamp` and is rejected outside a shift", async () => {
    const { staff } = await makeCampaignWithActivation();
    const token = await staffToken(staff.mobileUsername, "field-pw");
    const ping = { latitude: 6.9, longitude: 79.9, timestamp: new Date().toISOString() };

    const before = await request(app).post("/v1/location/ping").set("Authorization", `Bearer ${token}`).send(ping);
    expect(before.status).toBe(422);
  });

  it("stock PATCH validates soldToday <= openingStock", async () => {
    const { staff, outlet, campaign } = await makeCampaignWithActivation();
    const token = await staffToken(staff.mobileUsername, "field-pw");
    await request(app).post("/v1/attendance/check-in").set("Authorization", `Bearer ${token}`).send({ latitude: outlet.latitude, longitude: outlet.longitude });

    const list = await request(app)
      .get(`/v1/campaigns/${campaign.id}/outlets/${outlet.id}/products`)
      .set("Authorization", `Bearer ${token}`);
    const cpaId = list.body.data[0].campaignProductAssignmentId;

    const bad = await request(app)
      .patch(`/v1/products/${cpaId}/stock`)
      .set("Authorization", `Bearer ${token}`)
      .send({ openingStock: 5, soldToday: 9 });
    expect(bad.status).toBe(400);

    const ok = await request(app)
      .patch(`/v1/products/${cpaId}/stock`)
      .set("Authorization", `Bearer ${token}`)
      .send({ openingStock: 10, soldToday: 4 });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ campaignProductAssignmentId: cpaId, remainingStock: 6 });
  });
});
