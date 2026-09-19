import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, resetDb, staffToken, makeStaff, makeCampaignWithActivation, adminToken, confirmSales } from "./helpers";
import { prisma } from "../src/utils/prisma";
import { dayDate } from "../src/utils/dates";

beforeEach(resetDb);

// A supervisor's visit and the promoter they cover both hang off the SAME
// Activation on the same day. Attendance and location trails belong to whoever
// checked in — they must never be shared or mixed up.

async function fixture() {
  const base = await makeCampaignWithActivation();
  const supervisor = await makeStaff({ userType: "supervisor" });
  await prisma.activation.update({ where: { id: base.activation.id }, data: { supervisorStaffId: supervisor.id } });
  const geo = { latitude: base.outlet.latitude, longitude: base.outlet.longitude };
  const promoterAuth = { Authorization: `Bearer ${await staffToken(base.staff.mobileUsername, "field-pw")}` };
  const supervisorAuth = { Authorization: `Bearer ${await staffToken(supervisor.mobileUsername, "field-pw")}` };
  const admin = { Authorization: `Bearer ${await adminToken()}` };
  return { ...base, supervisor, geo, promoterAuth, supervisorAuth, admin };
}
type Fx = Awaited<ReturnType<typeof fixture>>;

const checkIn = (f: Fx, who: "promoter" | "supervisor") =>
  request(app)
    .post("/v1/attendance/check-in")
    .set(who === "promoter" ? f.promoterAuth : f.supervisorAuth)
    .send({ ...(who === "supervisor" ? { assignmentId: f.activation.id } : {}), ...f.geo });
const checkOut = (f: Fx, who: "promoter" | "supervisor") =>
  request(app)
    .post("/v1/attendance/check-out")
    .set(who === "promoter" ? f.promoterAuth : f.supervisorAuth)
    .send({ ...(who === "supervisor" ? { assignmentId: f.activation.id } : {}), ...f.geo });
const today = (f: Fx, who: "promoter" | "supervisor") =>
  request(app)
    .get("/v1/attendance/today")
    .query(who === "supervisor" ? { assignmentId: f.activation.id } : {})
    .set(who === "promoter" ? f.promoterAuth : f.supervisorAuth);

describe("mobile check-in: promoter and supervisor on one activation", () => {
  it("does not show the supervisor as checked in just because the promoter is", async () => {
    const f = await fixture();
    expect((await checkIn(f, "promoter")).status).toBe(201);
    const seen = await today(f, "supervisor");
    expect(seen.body.data.checkedIn).toBe(false);
  });

  it("lets the supervisor check in after the promoter, each with their own record", async () => {
    const f = await fixture();
    await checkIn(f, "promoter");
    expect((await checkIn(f, "supervisor")).status).toBe(201);
    const rows = await prisma.attendanceRecord.findMany({ where: { activationId: f.activation.id } });
    expect(rows.map((r) => r.staffId).sort()).toEqual([f.staff.id, f.supervisor.id].sort());
  });

  it("lets the promoter check in after the supervisor", async () => {
    const f = await fixture();
    await checkIn(f, "supervisor");
    expect((await checkIn(f, "promoter")).status).toBe(201);
  });

  it("supervisor check-out leaves the promoter's shift open, and vice versa", async () => {
    const f = await fixture();
    await checkIn(f, "promoter");
    await checkIn(f, "supervisor");
    expect((await checkOut(f, "supervisor")).status).toBe(200);
    expect((await today(f, "promoter")).body.data).toMatchObject({ checkedIn: true, checkOutAt: null });
    expect((await today(f, "supervisor")).body.data.checkedIn).toBe(false);

    await checkIn(f, "supervisor");
    await confirmSales(f.activation.id);
    expect((await checkOut(f, "promoter")).status).toBe(200);
    expect((await today(f, "supervisor")).body.data.checkedIn).toBe(true);
  });

  it("each person's one-open-shift lock and history only cover their own records", async () => {
    const f = await fixture();
    await checkIn(f, "promoter");
    // supervisor's history is empty; the promoter's shows the promoter's day only
    const supHistory = await request(app).get("/v1/attendance/history").set(f.supervisorAuth);
    expect(supHistory.body.data).toHaveLength(0);
    const promHistory = await request(app).get("/v1/attendance/history").set(f.promoterAuth);
    expect(promHistory.body.data).toHaveLength(1);
  });

  it("a supervisor's check-in does not unlock the promoter's sales entry", async () => {
    const f = await fixture();
    await checkIn(f, "supervisor");
    const res = await request(app).patch("/v1/stats/today").set(f.promoterAuth).send({ footFall: 5 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("NOT_CHECKED_IN");
  });
});

describe("location trails", () => {
  it("attribute each ping to whoever sent it", async () => {
    const f = await fixture();
    await checkIn(f, "promoter");
    await checkIn(f, "supervisor");
    const ping = (auth: Record<string, string>, lat: number) =>
      request(app).post("/v1/location/ping").set(auth).send({ latitude: lat, longitude: 79.9 });
    expect((await ping(f.promoterAuth, 6.91)).status).toBe(204);
    expect((await ping(f.supervisorAuth, 7.25)).status).toBe(204);

    const pings = await prisma.trackingPing.findMany({ where: { activationId: f.activation.id } });
    expect(pings.find((p) => p.latitude === 6.91)?.staffId).toBe(f.staff.id);
    expect(pings.find((p) => p.latitude === 7.25)?.staffId).toBe(f.supervisor.id);

    const url = (kind: string) => `/admin/v1/campaigns/${f.campaign.id}/tracking/${kind}-history`;
    const promoterTrail = await request(app).get(url("promoter")).set(f.admin);
    expect(promoterTrail.body.data.map((p: { latitude: number }) => p.latitude)).toEqual([6.91]);
    const supervisorTrail = await request(app).get(url("supervisor")).set(f.admin);
    expect(supervisorTrail.body.data.map((p: { latitude: number }) => p.latitude)).toEqual([7.25]);
    expect(supervisorTrail.body.data[0].staffName).toBe(f.supervisor.fullName);
  });

  it("live tracking lists each open shift under the right person", async () => {
    const f = await fixture();
    await checkIn(f, "promoter");
    await checkIn(f, "supervisor");
    const res = await request(app).get(`/admin/v1/campaigns/${f.campaign.id}/tracking/live`).set(f.admin);
    expect(res.body.data.map((p: { staffName: string }) => p.staffName).sort()).toEqual([f.staff.fullName, f.supervisor.fullName].sort());
  });
});

describe("portal attendance reads", () => {
  async function bothCheckedIn(f: Fx) {
    await checkIn(f, "promoter");
    await checkIn(f, "supervisor");
  }
  const attendanceUrl = (f: Fx) => `/admin/v1/campaigns/${f.campaign.id}/attendance`;

  it("filters the attendance log by the person who checked in, and shows their name", async () => {
    const f = await fixture();
    await bothCheckedIn(f);
    const promoters = await request(app).get(attendanceUrl(f)).query({ role: "promoter" }).set(f.admin);
    expect(promoters.body.data).toHaveLength(1);
    expect(promoters.body.data[0].staff.fullName).toBe(f.staff.fullName);
    const supervisors = await request(app).get(attendanceUrl(f)).query({ role: "supervisor" }).set(f.admin);
    expect(supervisors.body.data).toHaveLength(1);
    expect(supervisors.body.data[0].staff.fullName).toBe(f.supervisor.fullName);
  });

  it("Outlet Attendance lists the supervisor's visit under the supervisor's name", async () => {
    const f = await fixture();
    await bothCheckedIn(f);
    const res = await request(app).get(`/admin/v1/campaigns/${f.campaign.id}/outlet-attendance`).set(f.admin);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ supervisorName: f.supervisor.fullName, outletName: f.outlet.name });
  });

  it("a supervisor's visit does not make the promoter look present (absence, compliance, monthly)", async () => {
    const f = await fixture();
    await checkIn(f, "supervisor");
    const date = dayDate().toISOString().slice(0, 10);
    const base = `/admin/v1/campaigns/${f.campaign.id}`;

    const absence = await request(app).get(`${base}/absence`).query({ date }).set(f.admin);
    expect(absence.body.data.map((r: { staffId: string }) => r.staffId)).toContain(f.staff.id);

    const status = await request(app).get(`${base}/reports/sales-status`).query({ date }).set(f.admin);
    expect(status.body.data.find((r: { activationId: string }) => r.activationId === f.activation.id).status).toBe("absent");

    const month = date.slice(0, 7);
    const monthly = await request(app).get(`${base}/reports/attendance-monthly`).query({ month }).set(f.admin);
    const row = monthly.body.data.rows.find((r: { activationId: string }) => r.activationId === f.activation.id);
    expect(Object.values(row.days)).not.toContain("✓");
  });

  it("the promoter's attendance percentage ignores the supervisor's records", async () => {
    const f = await fixture();
    const date = dayDate();
    await prisma.attendanceRecord.create({ data: { activationId: f.activation.id, staffId: f.staff.id, date, status: "absent" } });
    await prisma.attendanceRecord.create({
      data: { activationId: f.activation.id, staffId: f.supervisor.id, date: new Date(date.getTime() - 86400000), status: "on_time", checkInAt: new Date() },
    });
    const res = await request(app).get(`/admin/v1/staff/${f.staff.id}/evaluation`).set(f.admin);
    expect(res.body.data.attendancePct).toBe(0);
  });
});

describe("checklist completion sees supervisor visits that never started", () => {
  it("counts a checked-in visit with no answers as an incomplete checklist", async () => {
    const f = await fixture();
    await prisma.supervisorTask.create({ data: { campaignId: f.campaign.id, category: "Sale", taskType: "range", task: "Pricing" } });
    await checkIn(f, "supervisor");
    const res = await request(app).get(`/admin/v1/campaigns/${f.campaign.id}/supervisor-task-summary`).set(f.admin);
    expect(res.body.data.visits).toEqual({ total: 1, complete: 0, incomplete: 1 });
    expect(res.body.data.incompleteVisits[0]).toMatchObject({ promoterName: f.staff.fullName, answered: 0, total: 1 });
  });

  it("does not count the promoter's own check-in as a supervisor visit", async () => {
    const f = await fixture();
    await prisma.supervisorTask.create({ data: { campaignId: f.campaign.id, category: "Sale", taskType: "range", task: "Pricing" } });
    await checkIn(f, "promoter");
    const res = await request(app).get(`/admin/v1/campaigns/${f.campaign.id}/supervisor-task-summary`).set(f.admin);
    expect(res.body.data.visits.total).toBe(0);
  });
});
