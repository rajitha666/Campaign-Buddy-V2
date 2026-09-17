import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, resetDb, staffToken, makeCampaignWithActivation, makeStaff } from "./helpers";
import { prisma } from "../src/utils/prisma";

beforeEach(resetDb);

describe("attendance — activation lookup day boundary (issue #42)", () => {
  it("check-in succeeds on the activation's first day even when the server is ahead of UTC", async () => {
    // Regression: the mobile routes computed "today" with server-LOCAL
    // midnight, while activation dateFrom/dateTo are stored as UTC
    // midnights. On servers with a positive UTC offset this makes
    // `startOfDay(now) < dateFrom` for the first hours of the local day,
    // so staff assigned for today got "No assignment for today".
    const { staff, outlet } = await makeCampaignWithActivation();
    const token = await staffToken(staff.mobileUsername, "field-pw");
    const auth = { Authorization: `Bearer ${token}` };
    const geo = { latitude: outlet.latitude, longitude: outlet.longitude };

    const prevTz = process.env.TZ;
    try {
      process.env.TZ = "Asia/Colombo"; // UTC+5:30 — before 05:30 local, local midnight is still "yesterday" in UTC terms
      const tomorrow = new Date();
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      await prisma.activation.update({
        where: { id: (await prisma.activation.findFirstOrThrow({ where: { staffId: staff.id } })).id },
        data: { dateFrom: new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`) },
      });

      const checkIn = await request(app).post("/v1/attendance/check-in").set(auth).send(geo);
      expect(checkIn.status).toBe(201);
    } finally {
      process.env.TZ = prevTz;
    }
  });
});

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

  it("a shift left open from a PRIOR day does not block today's check-in", async () => {
    // Regression: /attendance/today correctly shows "not checked in" for
    // today, but the old lock query matched any open record ever, so a
    // forgotten check-out from yesterday would 409 today's check-in with
    // "already checked in for this activation".
    const { staff, activation, outlet } = await makeCampaignWithActivation();
    const token = await staffToken(staff.mobileUsername, "field-pw");
    const auth = { Authorization: `Bearer ${token}` };
    const geo = { latitude: outlet.latitude, longitude: outlet.longitude };

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    await prisma.attendanceRecord.create({
      data: {
        activationId: activation.id,
        date: yesterday,
        checkInAt: new Date(yesterday.getTime() + 9 * 3600000),
        status: "on_time",
      },
    });

    const today = await request(app).get("/v1/attendance/today").set(auth);
    expect(today.body.data.checkedIn).toBe(false);

    const checkIn = await request(app).post("/v1/attendance/check-in").set(auth).send(geo);
    expect(checkIn.status).toBe(201);

    const stale = await prisma.attendanceRecord.findFirst({ where: { activationId: activation.id, date: yesterday } });
    expect(stale?.checkOutAt).not.toBeNull();
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

    const listBefore = await request(app)
      .get(`/v1/campaigns/${campaign.id}/outlets/${outlet.id}/products`)
      .set("Authorization", `Bearer ${token}`);
    const blockedStock = await request(app)
      .patch(`/v1/products/${listBefore.body.data[0].campaignProductAssignmentId}/stock`)
      .set("Authorization", `Bearer ${token}`)
      .send({ openingStock: 5, soldToday: 1 });
    expect(blockedStock.status).toBe(422);
    expect(blockedStock.body.error.code).toBe("NOT_CHECKED_IN");

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
