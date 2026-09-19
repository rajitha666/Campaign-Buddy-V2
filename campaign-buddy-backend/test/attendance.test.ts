import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, resetDb, staffToken, makeCampaignWithActivation, makeStaff } from "./helpers";
import { prisma } from "../src/utils/prisma";
import { dayDate } from "../src/utils/dates";

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
    // Two check-ins in one day need the supervisor exemption — geofence
    // verification itself is identical for promoters and supervisors.
    await prisma.staff.update({ where: { id: staff.id }, data: { userType: "supervisor" } });
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

  it("a PROMOTER cannot re-check-in after checking out for the day", async () => {
    const { staff, outlet, activation } = await makeCampaignWithActivation();
    const token = await staffToken(staff.mobileUsername, "field-pw");
    const auth = { Authorization: `Bearer ${token}` };
    const geo = { latitude: outlet.latitude, longitude: outlet.longitude };

    await request(app).post("/v1/attendance/check-in").set(auth).send(geo);
    await request(app).post("/v1/attendance/check-out").set(auth).send(geo);
    const reIn = await request(app).post("/v1/attendance/check-in").set(auth).send(geo);
    expect(reIn.status).toBe(409);
    expect(reIn.body.error.code).toBe("ALREADY_CHECKED_OUT");

    const record = await prisma.attendanceRecord.findUniqueOrThrow({
      where: { activationId_staffId_date: { activationId: activation.id, staffId: staff.id, date: dayDate() } },
    });
    expect(record.checkOutAt).not.toBeNull();
  });

  it("a SUPERVISOR can check out of one outlet and check into the next on their route", async () => {
    const { staff, campaign, outlet, activation } = await makeCampaignWithActivation();
    await prisma.staff.update({ where: { id: staff.id }, data: { userType: "supervisor" } });
    const city = await prisma.city.create({ data: { name: "City2", province: "P", district: "D" } });
    const outlet2 = await prisma.outlet.create({
      data: { outletNo: `O2-${Math.random().toString(36).slice(2, 7)}`, name: "Outlet 2", cityId: city.id, latitude: 7.1, longitude: 80.1 },
    });
    const activation2 = await prisma.activation.create({
      data: { name: "Activation 2", campaignId: campaign.id, outletId: outlet2.id, staffId: staff.id, dateFrom: campaign.startDate, dateTo: campaign.endDate },
    });

    const token = await staffToken(staff.mobileUsername, "field-pw");
    const auth = { Authorization: `Bearer ${token}` };
    const geo = { latitude: outlet.latitude, longitude: outlet.longitude };
    const geo2 = { latitude: outlet2.latitude, longitude: outlet2.longitude };

    await request(app).post("/v1/attendance/check-in").set(auth).send({ ...geo, assignmentId: activation.id }).expect(201);
    await request(app).post("/v1/attendance/check-out").set(auth).send({}).expect(200);
    const next = await request(app).post("/v1/attendance/check-in").set(auth).send({ ...geo2, assignmentId: activation2.id });
    expect(next.status).toBe(201);
    expect(next.body.data.assignmentId).toBe(activation2.id);

    const stale = await prisma.attendanceRecord.findUnique({
      where: { activationId_staffId_date: { activationId: activation.id, staffId: staff.id, date: dayDate() } },
    });
    expect(stale?.checkOutAt).not.toBeNull();
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
        staffId: staff.id,
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

// Regression — the attendance routes still scoped every lookup to
// Activation.staffId (the promoter). A supervisor on a route is recorded as
// supervisorStaffId (fixed in /me/assignments #63 but never carried over
// here), so checking in with an assignment id from /me/assignments 404'd with
// "No assignment for today", and /attendance/today, check-out and history
// were equally blind to their records.
describe("attendance — supervisor route mode (supervisorStaffId)", () => {
  async function makeSupervisorWithRoute() {
    const promoter = await makeStaff();
    const supervisor = await makeStaff({ userType: "supervisor" });
    const client = await prisma.client.create({ data: { companyName: "Co", clientName: "C" } });
    const city = await prisma.city.create({ data: { name: "City", province: "P", district: "D" } });
    const outletA = await prisma.outlet.create({
      data: { outletNo: `OA-${Math.random().toString(36).slice(2, 7)}`, name: "Outlet A", cityId: city.id, latitude: 6.9, longitude: 79.9 },
    });
    const outletB = await prisma.outlet.create({
      data: { outletNo: `OB-${Math.random().toString(36).slice(2, 7)}`, name: "Outlet B", cityId: city.id, latitude: 7.1, longitude: 80.1 },
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
    const activationA = await prisma.activation.create({
      data: { name: "Visit A", campaignId: campaign.id, outletId: outletA.id, staffId: promoter.id, supervisorStaffId: supervisor.id, dateFrom: today, dateTo: today },
    });
    const activationB = await prisma.activation.create({
      data: { name: "Visit B", campaignId: campaign.id, outletId: outletB.id, staffId: promoter.id, supervisorStaffId: supervisor.id, dateFrom: today, dateTo: today },
    });
    const token = await staffToken(supervisor.mobileUsername, "field-pw");
    return { supervisor, activationA, activationB, outletA, outletB, token };
  }

  it("check-in accepts an assignment from /me/assignments (supervised, not staffed)", async () => {
    const { activationA, outletA, token } = await makeSupervisorWithRoute();
    const res = await request(app)
      .post("/v1/attendance/check-in")
      .set("Authorization", `Bearer ${token}`)
      .send({ assignmentId: activationA.id, latitude: outletA.latitude, longitude: outletA.longitude });
    expect(res.status).toBe(201);
    expect(res.body.data.assignmentId).toBe(activationA.id);
  });

  it("GET /attendance/today resolves a supervised assignment by id", async () => {
    const { activationA, outletA, token } = await makeSupervisorWithRoute();
    await request(app)
      .post("/v1/attendance/check-in")
      .set("Authorization", `Bearer ${token}`)
      .send({ assignmentId: activationA.id, latitude: outletA.latitude, longitude: outletA.longitude })
      .expect(201);

    const today = await request(app)
      .get("/v1/attendance/today")
      .query({ assignmentId: activationA.id })
      .set("Authorization", `Bearer ${token}`);
    expect(today.status).toBe(200);
    expect(today.body.data.checkedIn).toBe(true);
  });

  it("bare check-out (no assignmentId) closes the supervisor's OPEN shift, not an arbitrary activation", async () => {
    // Bug: supersvisor's app sends no assignmentId on the Attendance-screen
    // checkout; the old bare findFirst picked an arbitrary today-activation
    // and 422'd with NOT_CHECKED_IN even though a shift was open elsewhere.
    const { activationA, activationB, outletA, token } = await makeSupervisorWithRoute();
    const auth = { Authorization: `Bearer ${token}` };
    await request(app)
      .post("/v1/attendance/check-in")
      .set(auth)
      .send({ assignmentId: activationA.id, latitude: outletA.latitude, longitude: outletA.longitude })
      .expect(201);

    const out = await request(app).post("/v1/attendance/check-out").set(auth).send({});
    expect(out.status).toBe(200);
    expect(out.body.data.assignmentId).toBe(activationA.id);

    // Route hop then a second bare checkout must hit the NEXT open shift
    await request(app)
      .post("/v1/attendance/check-in")
      .set(auth)
      .send({ assignmentId: activationB.id, latitude: outletA.latitude, longitude: outletA.longitude })
      .expect(201);
    const out2 = await request(app).post("/v1/attendance/check-out").set(auth).send({});
    expect(out2.status).toBe(200);
    expect(out2.body.data.assignmentId).toBe(activationB.id);
  });

  it("check-out takes an assignmentId and clears the lock so the supervisor can check into the next outlet", async () => {
    const { activationA, activationB, outletA, outletB, token } = await makeSupervisorWithRoute();
    const auth = { Authorization: `Bearer ${token}` };
    await request(app)
      .post("/v1/attendance/check-in")
      .set(auth)
      .send({ assignmentId: activationA.id, latitude: outletA.latitude, longitude: outletA.longitude })
      .expect(201);

    const out = await request(app)
      .post("/v1/attendance/check-out")
      .set(auth)
      .send({ assignmentId: activationA.id, latitude: outletA.latitude, longitude: outletA.longitude });
    expect(out.status).toBe(200);
    expect(out.body.data.assignmentId).toBe(activationA.id);

    const next = await request(app)
      .post("/v1/attendance/check-in")
      .set(auth)
      .send({ assignmentId: activationB.id, latitude: outletB.latitude, longitude: outletB.longitude });
    expect(next.status).toBe(201);
    expect(next.body.data.assignmentId).toBe(activationB.id);
  });

  it("assignmentId check-out/in of an outlet NOT active today is a 404", async () => {
    const { activationA, activationB, outletA, token } = await makeSupervisorWithRoute();
    const pastEnd = new Date();
    pastEnd.setDate(pastEnd.getDate() - 2);
    await prisma.activation.update({ where: { id: activationA.id }, data: { dateTo: pastEnd } });

    const auth = { Authorization: `Bearer ${token}` };
    const geo = { latitude: outletA.latitude, longitude: outletA.longitude };
    const out = await request(app)
      .post("/v1/attendance/check-out")
      .set(auth)
      .send({ assignmentId: activationA.id, latitude: geo.latitude, longitude: geo.longitude });
    expect(out.status).toBe(404);
    expect(out.body.error.code).toBe("NOT_FOUND");

    const checkIn = await request(app)
      .post("/v1/attendance/check-in")
      .set(auth)
      .send({ assignmentId: activationA.id, latitude: geo.latitude, longitude: geo.longitude });
    expect(checkIn.status).toBe(404);
    expect(checkIn.body.error.code).toBe("NOT_FOUND");

    // Their actual today-assignment is untouched
    const res = await request(app)
      .post("/v1/attendance/check-in")
      .set(auth)
      .send({ assignmentId: activationB.id, latitude: geo.latitude, longitude: geo.longitude });
    expect(res.status).toBe(201);
  });

  it("attendance history includes supervised-activation records", async () => {
    const { activationA, outletA, token } = await makeSupervisorWithRoute();
    await request(app)
      .post("/v1/attendance/check-in")
      .set("Authorization", `Bearer ${token}`)
      .send({ assignmentId: activationA.id, latitude: outletA.latitude, longitude: outletA.longitude })
      .expect(201);

    const history = await request(app).get("/v1/attendance/history").set("Authorization", `Bearer ${token}`);
    expect(history.status).toBe(200);
    expect(history.body.data).toHaveLength(1);
  });

  it("location ping is accepted while checked in on a supervised activation", async () => {
    const { activationA, outletA, token } = await makeSupervisorWithRoute();
    await request(app)
      .post("/v1/attendance/check-in")
      .set("Authorization", `Bearer ${token}`)
      .send({ assignmentId: activationA.id, latitude: outletA.latitude, longitude: outletA.longitude })
      .expect(201);

    const ping = await request(app)
      .post("/v1/location/ping")
      .set("Authorization", `Bearer ${token}`)
      .send({ latitude: outletA.latitude, longitude: outletA.longitude, timestamp: new Date().toISOString() });
    expect(ping.status).toBe(204);
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

describe("attendance — offline-captured times (capturedAt)", () => {
  // Midpoint between UTC midnight and now: always earlier than now, always the same UTC day.
  const earlierToday = () => new Date((dayDate().getTime() + Date.now()) / 2);

  it("a queued check-in / check-out is recorded at the time the promoter actually did it", async () => {
    const { staff, outlet, activation } = await makeCampaignWithActivation();
    const auth = { Authorization: `Bearer ${await staffToken(staff.mobileUsername, "field-pw")}` };
    const geo = { latitude: outlet.latitude, longitude: outlet.longitude };
    const inAt = earlierToday();
    const outAt = new Date((inAt.getTime() + Date.now()) / 2);

    await request(app).post("/v1/attendance/check-in").set(auth).send({ ...geo, capturedAt: inAt.toISOString() }).expect(201);
    await request(app).post("/v1/attendance/check-out").set(auth).send({ ...geo, capturedAt: outAt.toISOString() }).expect(200);

    const rec = await prisma.attendanceRecord.findUniqueOrThrow({
      where: { activationId_staffId_date: { activationId: activation.id, staffId: staff.id, date: dayDate() } },
    });
    expect(rec.checkInAt?.toISOString()).toBe(inAt.toISOString());
    expect(rec.checkOutAt?.toISOString()).toBe(outAt.toISOString());
  });

  it("a check-out time earlier than the check-in is clamped to the check-in", async () => {
    const { staff, outlet, activation } = await makeCampaignWithActivation();
    const auth = { Authorization: `Bearer ${await staffToken(staff.mobileUsername, "field-pw")}` };
    const geo = { latitude: outlet.latitude, longitude: outlet.longitude };
    const inAt = earlierToday();

    await request(app).post("/v1/attendance/check-in").set(auth).send({ ...geo, capturedAt: inAt.toISOString() }).expect(201);
    await request(app)
      .post("/v1/attendance/check-out")
      .set(auth)
      .send({ ...geo, capturedAt: new Date(inAt.getTime() - 60_000).toISOString() })
      .expect(200);

    const rec = await prisma.attendanceRecord.findUniqueOrThrow({
      where: { activationId_staffId_date: { activationId: activation.id, staffId: staff.id, date: dayDate() } },
    });
    expect(rec.checkOutAt?.toISOString()).toBe(inAt.toISOString());
  });

  it("a plain online check-in keeps server time — `timestamp` alone is never trusted", async () => {
    const { staff, outlet, activation } = await makeCampaignWithActivation();
    const auth = { Authorization: `Bearer ${await staffToken(staff.mobileUsername, "field-pw")}` };
    const before = Date.now();
    await request(app)
      .post("/v1/attendance/check-in")
      .set(auth)
      .send({ latitude: outlet.latitude, longitude: outlet.longitude, timestamp: earlierToday().toISOString() })
      .expect(201);
    const rec = await prisma.attendanceRecord.findUniqueOrThrow({
      where: { activationId_staffId_date: { activationId: activation.id, staffId: staff.id, date: dayDate() } },
    });
    expect(rec.checkInAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it("a capturedAt in the future is ignored", async () => {
    const { staff, outlet, activation } = await makeCampaignWithActivation();
    const auth = { Authorization: `Bearer ${await staffToken(staff.mobileUsername, "field-pw")}` };
    const before = Date.now();
    await request(app)
      .post("/v1/attendance/check-in")
      .set(auth)
      .send({ latitude: outlet.latitude, longitude: outlet.longitude, capturedAt: new Date(before + 3_600_000).toISOString() })
      .expect(201);
    const rec = await prisma.attendanceRecord.findUniqueOrThrow({
      where: { activationId_staffId_date: { activationId: activation.id, staffId: staff.id, date: dayDate() } },
    });
    expect(rec.checkInAt!.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });
});
