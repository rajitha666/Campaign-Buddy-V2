import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { resetDb, adminToken, staffToken, makeStaff, makeCampaignWithActivation } from "./helpers";
import { prisma } from "../src/utils/prisma";
import { dayDate } from "../src/utils/dates";
import { checklistCompletion } from "../src/utils/supervisorChecklist";

beforeEach(resetDb);

const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d494844520000000100000001080600000" + "01f15c4890000000a49444154789c6300010000050001" + "0d0a2db4",
  "hex"
);
const png = { filename: "p.png", contentType: "image/png" };

// Supervisor outlet checklist (mobile): supervisors visit each outlet, score the
// promoter against the campaign's QA checklist (1-5 ratings with fixed
// definitions, free-text feedback, and a configured number of setup photos).

async function fixture() {
  const base = await makeCampaignWithActivation();
  const supervisor = await makeStaff({ userType: "supervisor" });
  await prisma.activation.update({ where: { id: base.activation.id }, data: { supervisorStaffId: supervisor.id } });
  const rating = await prisma.supervisorTask.create({
    data: { campaignId: base.campaign.id, category: "Attitude", taskType: "range", task: "Promoter attitude towards shoppers" },
  });
  const feedback = await prisma.supervisorTask.create({
    data: { campaignId: base.campaign.id, category: "Documentation", taskType: "feedback", task: "Any stock or paperwork issues?" },
  });
  const photo = await prisma.supervisorTask.create({
    data: { campaignId: base.campaign.id, category: "Outlet PR", taskType: "photo", task: "Photo of the display setup", imageCount: 2 },
  });
  const token = await staffToken(supervisor.mobileUsername, "field-pw");
  const auth = { Authorization: `Bearer ${token}` };
  return { ...base, supervisor, token, auth, rating, feedback, photo };
}
type Fx = Awaited<ReturnType<typeof fixture>>;

// A second promoter at the SAME outlet, covered by the same supervisor.
async function secondPromoter(f: Fx) {
  const staff = await makeStaff();
  const activation = await prisma.activation.create({
    data: {
      name: "Second", campaignId: f.campaign.id, outletId: f.outlet.id, staffId: staff.id,
      supervisorStaffId: f.supervisor.id, dateFrom: f.campaign.startDate, dateTo: f.campaign.endDate,
    },
  });
  return { staff, activation };
}

const tasksUrl = (assignmentId: string) => `/v1/me/assignments/${assignmentId}/supervisor-tasks`;
const photosUrl = (assignmentId: string, taskId: string) => `${tasksUrl(assignmentId)}/${taskId}/photos`;
const save = (f: Fx, assignmentId: string, responses: unknown[]) =>
  request(app).put(`${tasksUrl(assignmentId)}/responses`).set(f.auth).send({ responses });
const upload = (f: Fx, assignmentId: string) =>
  request(app).post(photosUrl(assignmentId, f.photo.id)).set(f.auth).attach("image", PNG, png);

describe("checklistCompletion", () => {
  const tasks = [
    { id: "r", taskType: "range" as const, imageCount: 0 },
    { id: "f", taskType: "feedback" as const, imageCount: 0 },
    { id: "p", taskType: "photo" as const, imageCount: 2 },
  ];
  it("counts a task done when rated, given feedback, or fully photographed", () => {
    const answers = new Map([
      ["r", { rating: 4, feedback: null, photoCount: 0 }],
      ["f", { rating: null, feedback: "  ", photoCount: 0 }],
      ["p", { rating: null, feedback: null, photoCount: 1 }],
    ]);
    expect(checklistCompletion(tasks, answers)).toEqual({ answered: 1, total: 3 });
    answers.set("f", { rating: null, feedback: "ok", photoCount: 0 });
    answers.set("p", { rating: null, feedback: null, photoCount: 2 });
    expect(checklistCompletion(tasks, answers)).toEqual({ answered: 3, total: 3 });
  });
});

describe("admin: defining checklist tasks", () => {
  it("creates a photo task with an image count, and requires a count of at least 1", async () => {
    const { campaign } = await fixture();
    const auth = { Authorization: `Bearer ${await adminToken()}` };
    const ok = await request(app)
      .post(`/admin/v1/campaigns/${campaign.id}/supervisor-tasks`)
      .set(auth)
      .send({ category: "Outlet PR", taskType: "photo", task: "Shelf photo", imageCount: 3 });
    expect(ok.status).toBe(201);
    expect(ok.body.data.imageCount).toBe(3);

    const missing = await request(app)
      .post(`/admin/v1/campaigns/${campaign.id}/supervisor-tasks`)
      .set(auth)
      .send({ category: "Outlet PR", taskType: "photo", task: "Shelf photo" });
    expect(missing.status).toBe(400);
  });

  it("refuses to change a task's type once supervisors have answered it, but still allows rewording", async () => {
    const f = await fixture();
    await save(f, f.activation.id, [{ taskId: f.rating.id, rating: 3 }]);
    const auth = { Authorization: `Bearer ${await adminToken()}` };
    const url = `/admin/v1/campaigns/${f.campaign.id}/supervisor-tasks/${f.rating.id}`;
    expect((await request(app).patch(url).set(auth).send({ taskType: "feedback" })).status).toBe(400);
    const reword = await request(app).patch(url).set(auth).send({ task: "Attitude to shoppers", taskType: "range" });
    expect(reword.status).toBe(200);
  });
});

describe("GET /v1/me/assignments/:id/supervisor-tasks", () => {
  it("returns the campaign's tasks, the promoter being scored and the rating definitions", async () => {
    const f = await fixture();
    const res = await request(app).get(tasksUrl(f.activation.id)).set(f.auth);
    expect(res.status).toBe(200);
    expect(res.body.data.promoter.id).toBe(f.staff.id);
    expect(res.body.data.ratingScale.map((r: { value: number }) => r.value)).toEqual([1, 2, 3, 4, 5]);
    expect(res.body.data.ratingScale.every((r: { label: string; description: string }) => r.label && r.description)).toBe(true);
    const byId = Object.fromEntries(res.body.data.tasks.map((t: { id: string }) => [t.id, t]));
    expect(byId[f.photo.id]).toMatchObject({ taskType: "photo", imageCount: 2, response: null });
    expect(Object.keys(byId)).toHaveLength(3);
  });

  it("hides soft-deleted tasks", async () => {
    const f = await fixture();
    await prisma.supervisorTask.update({ where: { id: f.feedback.id }, data: { deletedAt: new Date() } });
    const res = await request(app).get(tasksUrl(f.activation.id)).set(f.auth);
    expect(res.body.data.tasks.map((t: { id: string }) => t.id)).not.toContain(f.feedback.id);
  });

  it("404s for an assignment the caller does not supervise", async () => {
    const f = await fixture();
    const other = await makeStaff({ userType: "supervisor" });
    const otherToken = await staffToken(other.mobileUsername, "field-pw");
    const res = await request(app).get(tasksUrl(f.activation.id)).set("Authorization", `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
  });

  it("404s when the activation is not active today", async () => {
    const f = await fixture();
    await prisma.activation.update({
      where: { id: f.activation.id },
      data: { dateFrom: new Date(dayDate().getTime() - 5 * 86400000), dateTo: new Date(dayDate().getTime() - 2 * 86400000) },
    });
    const res = await request(app).get(tasksUrl(f.activation.id)).set(f.auth);
    expect(res.status).toBe(404);
  });
});

describe("PUT /v1/me/assignments/:id/supervisor-tasks/responses", () => {
  it("saves ratings and feedback, and re-saving the same day updates instead of duplicating", async () => {
    const f = await fixture();
    const first = await save(f, f.activation.id, [{ taskId: f.rating.id, rating: 3 }, { taskId: f.feedback.id, feedback: "Stock shelf was low" }]);
    expect(first.status).toBe(200);
    await save(f, f.activation.id, [{ taskId: f.rating.id, rating: 5 }]);

    const rows = await prisma.supervisorTaskResponse.findMany({ where: { activationId: f.activation.id } });
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.taskId === f.rating.id)?.rating).toBe(5);
    expect(rows.find((r) => r.taskId === f.rating.id)?.supervisorStaffId).toBe(f.supervisor.id);
    expect(rows.every((r) => r.outletId === f.outlet.id)).toBe(true);

    const read = await request(app).get(tasksUrl(f.activation.id)).set(f.auth);
    const ratingTask = read.body.data.tasks.find((t: { id: string }) => t.id === f.rating.id);
    expect(ratingTask.response).toMatchObject({ rating: 5 });
  });

  it("rejects ratings outside 1-5, a rating on a non-range task, and tasks from another campaign", async () => {
    const f = await fixture();
    expect((await save(f, f.activation.id, [{ taskId: f.rating.id, rating: 6 }])).status).toBe(400);
    expect((await save(f, f.activation.id, [{ taskId: f.rating.id, rating: 0 }])).status).toBe(400);
    expect((await save(f, f.activation.id, [{ taskId: f.feedback.id, rating: 4 }])).status).toBe(400);

    const otherCampaign = await prisma.campaign.create({
      data: { campaignNo: "CMP-OTHER", name: "Other", clientId: f.client.id, startDate: new Date(), endDate: new Date() },
    });
    const foreign = await prisma.supervisorTask.create({
      data: { campaignId: otherCampaign.id, category: "Sale", taskType: "range", task: "Foreign" },
    });
    expect((await save(f, f.activation.id, [{ taskId: foreign.id, rating: 3 }])).status).toBe(404);
  });
});

describe("outlet setup photos", () => {
  it("uploads photos with a server timestamp, up to the task's image count, then refuses more", async () => {
    const f = await fixture();
    const one = await upload(f, f.activation.id);
    expect(one.status).toBe(200);
    expect(one.body.data.photos).toHaveLength(1);
    expect(one.body.data.photos[0].url).toMatch(/^\/uploads\/visit-photos\/.+\.png$/);
    expect(new Date(one.body.data.photos[0].uploadedAt).getTime()).toBeGreaterThan(Date.now() - 60000);
    expect((await upload(f, f.activation.id)).body.data.photos).toHaveLength(2);
    expect((await upload(f, f.activation.id)).status).toBe(400);
  });

  it("only accepts images, and only on photo tasks", async () => {
    const f = await fixture();
    const text = await request(app).post(photosUrl(f.activation.id, f.photo.id)).set(f.auth)
      .attach("image", Buffer.from("hello"), { filename: "note.txt", contentType: "text/plain" });
    expect(text.status).toBe(400);
    const wrongTask = await request(app).post(photosUrl(f.activation.id, f.rating.id)).set(f.auth).attach("image", PNG, png);
    expect(wrongTask.status).toBe(400);
  });

  it("removes a photo, keeps the answer row, and 404s for a url that isn't there", async () => {
    const f = await fixture();
    const up = await upload(f, f.activation.id);
    const url = up.body.data.photos[0].url as string;
    const del = await request(app).delete(photosUrl(f.activation.id, f.photo.id)).set(f.auth).query({ url });
    expect(del.status).toBe(200);
    expect(del.body.data.photos).toEqual([]);
    const again = await request(app).delete(photosUrl(f.activation.id, f.photo.id)).set(f.auth).query({ url });
    expect(again.status).toBe(404);
  });

  it("stores the extension from the verified image type, never from the client's filename", async () => {
    const f = await fixture();
    const res = await request(app).post(photosUrl(f.activation.id, f.photo.id)).set(f.auth)
      .attach("image", PNG, { filename: "evil.html", contentType: "image/png" });
    expect(res.status).toBe(200);
    expect(res.body.data.photos[0].url).toMatch(/\.png$/);
  });

  it("rejects SVG (can carry scripts) and other non-photo image types", async () => {
    const f = await fixture();
    const svg = await request(app).post(photosUrl(f.activation.id, f.photo.id)).set(f.auth)
      .attach("image", Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), { filename: "a.svg", contentType: "image/svg+xml" });
    expect(svg.status).toBe(400);
  });

  it("caps a photo at 5 MB with a clear 413", async () => {
    const f = await fixture();
    const big = Buffer.alloc(5 * 1024 * 1024 + 1024, 1);
    const res = await request(app).post(photosUrl(f.activation.id, f.photo.id)).set(f.auth)
      .attach("image", big, { filename: "big.jpg", contentType: "image/jpeg" });
    expect(res.status).toBe(413);
    expect(res.body.error.message).toMatch(/5 MB/);
  });
});

// Two promoters at one outlet: ratings/feedback are per promoter, but the
// outlet-setup photos are taken once per outlet and shared.
describe("two promoters at one outlet", () => {
  it("scores each promoter separately", async () => {
    const f = await fixture();
    const b = await secondPromoter(f);
    await save(f, f.activation.id, [{ taskId: f.rating.id, rating: 5 }]);
    await save(f, b.activation.id, [{ taskId: f.rating.id, rating: 2 }]);
    const readB = await request(app).get(tasksUrl(b.activation.id)).set(f.auth);
    expect(readB.body.data.promoter.id).toBe(b.staff.id);
    expect(readB.body.data.tasks.find((t: { id: string }) => t.id === f.rating.id).response.rating).toBe(2);
  });

  it("shares the outlet's photos across both promoters, and the photo limit with them", async () => {
    const f = await fixture();
    const b = await secondPromoter(f);
    await upload(f, f.activation.id);
    const readB = await request(app).get(tasksUrl(b.activation.id)).set(f.auth);
    expect(readB.body.data.tasks.find((t: { id: string }) => t.id === f.photo.id).response.photos).toHaveLength(1);

    expect((await upload(f, b.activation.id)).body.data.photos).toHaveLength(2);
    expect((await upload(f, f.activation.id)).status).toBe(400);
    expect(await prisma.supervisorTaskResponse.count({ where: { taskId: f.photo.id } })).toBe(1);
  });
});

describe("GET /admin/v1/campaigns/:id/supervisor-task-responses", () => {
  it("lists each answer with supervisor, outlet, rating and timestamped photos; photo rows include the visit's promoter", async () => {
    const f = await fixture();
    await save(f, f.activation.id, [{ taskId: f.rating.id, rating: 4 }]);
    await upload(f, f.activation.id);

    const res = await request(app).get(`/admin/v1/campaigns/${f.campaign.id}/supervisor-task-responses`)
      .set("Authorization", `Bearer ${await adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    const rated = res.body.data.find((r: { taskId: string }) => r.taskId === f.rating.id);
    expect(rated).toMatchObject({
      supervisorName: f.supervisor.fullName, promoterName: f.staff.fullName, outletName: f.outlet.name, category: "Attitude", rating: 4,
    });
    const photoRow = res.body.data.find((r: { taskId: string }) => r.taskId === f.photo.id);
    expect(photoRow.promoterName).toBe(f.staff.fullName);
    expect(photoRow.photos).toHaveLength(1);
    expect(photoRow.photos[0]).toHaveProperty("uploadedAt");
  });

  it("filters by a date range as well as a single day", async () => {
    const f = await fixture();
    await save(f, f.activation.id, [{ taskId: f.rating.id, rating: 4 }]);
    const auth = { Authorization: `Bearer ${await adminToken()}` };
    const url = `/admin/v1/campaigns/${f.campaign.id}/supervisor-task-responses`;
    const today = dayDate().toISOString().slice(0, 10);
    expect((await request(app).get(url).query({ dateFrom: today, dateTo: today }).set(auth)).body.data).toHaveLength(1);
    expect((await request(app).get(url).query({ dateFrom: "2020-01-01", dateTo: "2020-01-31" }).set(auth)).body.data).toHaveLength(0);
  });

  it("is readable by a portal supervisor and a sponsor, limited to their granted outlets", async () => {
    const f = await fixture();
    await save(f, f.activation.id, [{ taskId: f.rating.id, rating: 4 }]);
    const bcrypt = await import("bcrypt");
    const other = await prisma.outlet.create({
      data: { outletNo: "O-OTHER", name: "Other outlet", cityId: f.city.id, latitude: 6.9, longitude: 79.9 },
    });
    for (const roleId of ["supervisor", "sponsor"]) {
      const username = `${roleId}-user`;
      const user = await prisma.user.create({
        data: { username, passwordHash: await bcrypt.hash("pw-12345", 4), displayName: username, roleId },
      });
      await prisma.campaignAccessGrant.create({
        data: { userId: user.id, campaignId: f.campaign.id, scopeType: "subset", outletIds: [other.id] },
      });
      const token = (await request(app).post("/admin/v1/auth/login").send({ username, password: "pw-12345" })).body.data.accessToken;
      const res = await request(app).get(`/admin/v1/campaigns/${f.campaign.id}/supervisor-task-responses`).set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]); // granted only the other outlet
    }
  });
});

describe("GET /admin/v1/campaigns/:id/supervisor-task-summary", () => {
  it("averages ratings by promoter, outlet and category, and flags incomplete visits", async () => {
    const f = await fixture();
    const b = await secondPromoter(f);
    // Promoter A: fully answered (rating, feedback, both photos)
    await save(f, f.activation.id, [{ taskId: f.rating.id, rating: 5 }, { taskId: f.feedback.id, feedback: "All good" }]);
    await upload(f, f.activation.id);
    await upload(f, f.activation.id);
    // Promoter B: only a rating — but the outlet's photos are shared, so just feedback is missing
    await save(f, b.activation.id, [{ taskId: f.rating.id, rating: 3 }]);

    const res = await request(app).get(`/admin/v1/campaigns/${f.campaign.id}/supervisor-task-summary`)
      .set("Authorization", `Bearer ${await adminToken()}`);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.overall).toEqual({ average: 4, ratings: 2 });
    expect(d.byPromoter.find((p: { staffId: string }) => p.staffId === f.staff.id)).toMatchObject({ average: 5, ratings: 1 });
    expect(d.byPromoter.find((p: { staffId: string }) => p.staffId === b.staff.id)).toMatchObject({ average: 3, ratings: 1 });
    expect(d.byOutlet).toHaveLength(1);
    expect(d.byOutlet[0]).toMatchObject({ outletName: f.outlet.name, average: 4 });
    expect(d.byCategory).toEqual([{ category: "Attitude", average: 4, ratings: 2 }]);
    expect(d.visits).toEqual({ total: 2, complete: 1, incomplete: 1 });
    expect(d.incompleteVisits).toHaveLength(1);
    expect(d.incompleteVisits[0]).toMatchObject({ promoterName: b.staff.fullName, answered: 2, total: 3 });
  });

  it("filters by date range", async () => {
    const f = await fixture();
    await save(f, f.activation.id, [{ taskId: f.rating.id, rating: 5 }]);
    const res = await request(app)
      .get(`/admin/v1/campaigns/${f.campaign.id}/supervisor-task-summary`)
      .query({ dateFrom: "2020-01-01", dateTo: "2020-01-31" })
      .set("Authorization", `Bearer ${await adminToken()}`);
    expect(res.body.data.overall).toEqual({ average: null, ratings: 0 });
    expect(res.body.data.visits.total).toBe(0);
  });
});

describe("promoter evaluation", () => {
  it("includes the promoter's average supervisor QA score", async () => {
    const f = await fixture();
    await save(f, f.activation.id, [{ taskId: f.rating.id, rating: 4 }]);
    const res = await request(app).get(`/admin/v1/staff/${f.staff.id}/evaluation`).set("Authorization", `Bearer ${await adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.qaScore).toEqual({ average: 4, ratings: 1 });
  });

  it("reports no score when the promoter hasn't been rated", async () => {
    const f = await fixture();
    const res = await request(app).get(`/admin/v1/staff/${f.staff.id}/evaluation`).set("Authorization", `Bearer ${await adminToken()}`);
    expect(res.body.data.qaScore).toEqual({ average: null, ratings: 0 });
  });
});
