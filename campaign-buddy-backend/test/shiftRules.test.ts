import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, resetDb, staffToken, makeStaff, makeCampaignWithActivation, adminToken, confirmSales } from "./helpers";
import { prisma } from "../src/utils/prisma";

beforeEach(resetDb);

// Enhancement: a promoter may work AM at one outlet and PM at another, but never
// two shifts at once and never back to an outlet they already closed today; a
// supervisor may visit the same outlet several times a day, each visit with its
// own attendance row and its own checklist.

async function outletWithActivation(base: Awaited<ReturnType<typeof makeCampaignWithActivation>>, staffId: string, campaignId = base.campaign.id) {
  const city = await prisma.city.create({ data: { name: "C2", province: "P", district: "D" } });
  const outlet = await prisma.outlet.create({
    data: { outletNo: `O-${Math.random().toString(36).slice(2, 7)}`, name: "Outlet B", cityId: city.id, latitude: 7.1, longitude: 80.1 },
  });
  const activation = await prisma.activation.create({
    data: { name: "Act B", campaignId, outletId: outlet.id, staffId, dateFrom: base.campaign.startDate, dateTo: base.campaign.endDate },
  });
  return { outlet, activation };
}

const geo = (o: { latitude: number; longitude: number }) => ({ latitude: o.latitude, longitude: o.longitude });

describe("promoter: one open shift, several outlets a day", () => {
  async function fixture() {
    const a = await makeCampaignWithActivation();
    const b = await outletWithActivation(a, a.staff.id);
    const auth = { Authorization: `Bearer ${await staffToken(a.staff.mobileUsername, "field-pw")}` };
    const checkIn = (act: { id: string }, o: { latitude: number; longitude: number }) =>
      request(app).post("/v1/attendance/check-in").set(auth).send({ assignmentId: act.id, ...geo(o) });
    const checkOut = (act: { id: string }) => request(app).post("/v1/attendance/check-out").set(auth).send({ assignmentId: act.id });
    return { a, b, auth, checkIn, checkOut };
  }

  it("blocks checking in elsewhere while a shift is open", async () => {
    const { a, b, checkIn } = await fixture();
    await checkIn(a.activation, a.outlet).expect(201);
    const res = await checkIn(b.activation, b.outlet);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ALREADY_CHECKED_IN");
  });

  it("refuses check-out until that outlet's sales summary is confirmed", async () => {
    const { a, checkIn, checkOut } = await fixture();
    await checkIn(a.activation, a.outlet).expect(201);
    const res = await checkOut(a.activation);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("SALES_NOT_CONFIRMED");
    await confirmSales(a.activation.id);
    await checkOut(a.activation).expect(200);
  });

  it("allows a different outlet after check-out, but never the outlet already closed", async () => {
    const { a, b, checkIn, checkOut } = await fixture();
    await checkIn(a.activation, a.outlet).expect(201);
    await confirmSales(a.activation.id);
    await checkOut(a.activation).expect(200);

    await checkIn(b.activation, b.outlet).expect(201);
    await confirmSales(b.activation.id);
    await checkOut(b.activation).expect(200);

    const again = await checkIn(a.activation, a.outlet);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("ALREADY_CHECKED_OUT");
  });

  it("treats a second campaign at an already-closed outlet as the same outlet", async () => {
    const { a, checkIn, checkOut } = await fixture();
    const campaign2 = await prisma.campaign.create({
      data: { campaignNo: `CMP-${Math.random().toString(36).slice(2, 7)}`, name: "Campaign 2", clientId: a.client.id, startDate: a.campaign.startDate, endDate: a.campaign.endDate },
    });
    const sameOutlet = await prisma.activation.create({
      data: { name: "Act C2", campaignId: campaign2.id, outletId: a.outlet.id, staffId: a.staff.id, dateFrom: a.campaign.startDate, dateTo: a.campaign.endDate },
    });
    await checkIn(a.activation, a.outlet).expect(201);
    await confirmSales(a.activation.id);
    await checkOut(a.activation).expect(200);

    const res = await checkIn(sameOutlet, a.outlet);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ALREADY_CHECKED_OUT");
  });

  it("GET /attendance/today reports the open outlet and the outlets already worked", async () => {
    const { a, b, auth, checkIn, checkOut } = await fixture();
    await checkIn(a.activation, a.outlet).expect(201);
    await confirmSales(a.activation.id);
    await checkOut(a.activation).expect(200);
    await checkIn(b.activation, b.outlet).expect(201);

    const seen = await request(app).get("/v1/attendance/today").set(auth);
    expect(seen.body.data).toMatchObject({ checkedIn: true, openAssignmentId: b.activation.id, workedAssignmentIds: [a.activation.id] });
  });

  it("scopes /attendance/today to the requested outlet, counting the closed one as worked", async () => {
    const { a, b, auth, checkIn, checkOut } = await fixture();
    await checkIn(a.activation, a.outlet).expect(201);
    await confirmSales(a.activation.id);
    await checkOut(a.activation).expect(200);

    const forA = await request(app).get("/v1/attendance/today").query({ assignmentId: a.activation.id }).set(auth);
    expect(forA.body.data).toMatchObject({ checkedIn: false, checkOutAt: expect.any(String) });
    const forB = await request(app).get("/v1/attendance/today").query({ assignmentId: b.activation.id }).set(auth);
    expect(forB.body.data).toMatchObject({ checkedIn: false, checkOutAt: null });
  });
});

describe("supervisor: several visits to one outlet in a day", () => {
  async function fixture() {
    const base = await makeCampaignWithActivation();
    const supervisor = await makeStaff({ userType: "supervisor" });
    await prisma.activation.update({ where: { id: base.activation.id }, data: { supervisorStaffId: supervisor.id } });
    const rating = await prisma.supervisorTask.create({
      data: { campaignId: base.campaign.id, category: "Attitude", taskType: "range", task: "Attitude" },
    });
    const auth = { Authorization: `Bearer ${await staffToken(supervisor.mobileUsername, "field-pw")}` };
    const admin = { Authorization: `Bearer ${await adminToken()}` };
    const id = base.activation.id;
    const checkIn = () => request(app).post("/v1/attendance/check-in").set(auth).send({ assignmentId: id, ...geo(base.outlet) });
    const checkOut = () => request(app).post("/v1/attendance/check-out").set(auth).send({ assignmentId: id });
    const tasks = () => request(app).get(`/v1/me/assignments/${id}/supervisor-tasks`).set(auth);
    const save = (rate: number) =>
      request(app).put(`/v1/me/assignments/${id}/supervisor-tasks/responses`).set(auth).send({ responses: [{ taskId: rating.id, rating: rate }] });
    return { ...base, supervisor, rating, auth, admin, checkIn, checkOut, tasks, save };
  }

  it("records each check-in as its own visit, numbered", async () => {
    const f = await fixture();
    for (const n of [1, 2, 3]) {
      const res = await f.checkIn();
      expect(res.status).toBe(201);
      expect(res.body.data.visitNo).toBe(n);
      await f.checkOut().expect(200);
    }
    const rows = await prisma.attendanceRecord.findMany({ where: { staffId: f.supervisor.id }, orderBy: { visitNo: "asc" } });
    expect(rows.map((r) => [r.visitNo, r.checkOutAt !== null])).toEqual([[1, true], [2, true], [3, true]]);
  });

  it("still refuses a second check-in while a visit is open", async () => {
    const f = await fixture();
    await f.checkIn().expect(201);
    expect((await f.checkIn()).status).toBe(409);
  });

  it("reports the current visit on /attendance/today", async () => {
    const f = await fixture();
    await f.checkIn().expect(201);
    await f.checkOut().expect(200);
    await f.checkIn().expect(201);
    const seen = await request(app).get("/v1/attendance/today").query({ assignmentId: f.activation.id }).set(f.auth);
    expect(seen.body.data).toMatchObject({ checkedIn: true, visitNo: 2 });
  });

  it("gives every visit a fresh checklist and keeps the earlier visit's answers", async () => {
    const f = await fixture();
    await f.checkIn().expect(201);
    await f.save(2).expect(200);
    await f.checkOut().expect(200);
    // Still the first visit's answers until they check in again.
    expect((await f.tasks()).body.data.tasks[0].response.rating).toBe(2);

    await f.checkIn().expect(201);
    const fresh = await f.tasks();
    expect(fresh.body.data.visitNo).toBe(2);
    expect(fresh.body.data.tasks[0].response).toBeNull();
    await f.save(5).expect(200);

    const rows = await prisma.supervisorTaskResponse.findMany({ orderBy: { visitNo: "asc" } });
    expect(rows.map((r) => [r.visitNo, r.rating])).toEqual([[1, 2], [2, 5]]);
  });

  it("lists every visit on the portal results and counts them all in the score", async () => {
    const f = await fixture();
    await f.checkIn().expect(201);
    await f.save(2).expect(200);
    await f.checkOut().expect(200);
    await f.checkIn().expect(201);
    await f.save(4).expect(200);

    const list = await request(app).get(`/admin/v1/campaigns/${f.campaign.id}/supervisor-task-responses`).set(f.admin);
    expect(list.body.data.map((r: { visitNo: number; rating: number }) => [r.visitNo, r.rating]).sort()).toEqual([[1, 2], [2, 4]]);
    const summary = await request(app).get(`/admin/v1/campaigns/${f.campaign.id}/supervisor-task-summary`).set(f.admin);
    expect(summary.body.data.overall).toMatchObject({ average: 3, ratings: 2 });
    expect(summary.body.data.visits.total).toBe(2);

    // Each visit is its own row in the supervisor visit log, too.
    const log = await request(app).get(`/admin/v1/campaigns/${f.campaign.id}/outlet-attendance`).set(f.admin);
    expect(log.body.data.map((r: { visitNo: number }) => r.visitNo).sort()).toEqual([1, 2]);
  });
});
