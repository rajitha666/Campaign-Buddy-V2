import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/utils/prisma";
import { app, resetDb, adminToken, staffToken, makeCampaignWithActivation } from "./helpers";
import { dayDate } from "../src/utils/dates";

beforeEach(resetDb);

async function seedArchiveFixture() {
  const base = await makeCampaignWithActivation();
  const record = await prisma.salesRecord.create({
    data: { activationItemId: base.activationItem.id, date: dayDate(), openingStock: 50, soldToday: 20 },
  });
  const auth = `Bearer ${await adminToken()}`;
  return { ...base, record, auth };
}

// Soft-delete: archive → excluded everywhere; restore → back again; and a
// promoter's stock re-entry for the same product/day updates + unarchives.
describe("archive sales records", () => {
  it("archives, hides from sales list and sku-wise report, then restores", async () => {
    const f = await seedArchiveFixture();

    const before = await request(app).get(`/admin/v1/campaigns/${f.campaign.id}/sales`).set("Authorization", f.auth);
    expect(before.body.data).toHaveLength(1);

    const del = await request(app).delete(`/admin/v1/campaigns/${f.campaign.id}/sales/${f.record.id}`).set("Authorization", f.auth);
    expect(del.status).toBe(200);
    expect(del.body.data).toMatchObject({ id: f.record.id, softDeleted: true });
    expect((await prisma.salesRecord.findUnique({ where: { id: f.record.id } }))!.archivedAt).not.toBeNull();

    const after = await request(app).get(`/admin/v1/campaigns/${f.campaign.id}/sales`).set("Authorization", f.auth);
    expect(after.body.data).toHaveLength(0);

    // calculation exclusion — sku-wise grand total drops to 0
    const report = await request(app).get(`/admin/v1/campaigns/${f.campaign.id}/reports/sku-wise`).set("Authorization", f.auth);
    expect(report.body.meta).toEqual({ total: 0, grandTotal: 0 });

    // archive is idempotent-safe: re-archive → 404
    expect((await request(app).delete(`/admin/v1/campaigns/${f.campaign.id}/sales/${f.record.id}`).set("Authorization", f.auth)).status).toBe(404);

    const restore = await request(app).post(`/admin/v1/campaigns/${f.campaign.id}/sales/${f.record.id}/restore`).set("Authorization", f.auth);
    expect(restore.status).toBe(200);
    expect((await prisma.salesRecord.findUnique({ where: { id: f.record.id } }))!.archivedAt).toBeNull();

    const back = await request(app).get(`/admin/v1/campaigns/${f.campaign.id}/sales`).set("Authorization", f.auth);
    expect(back.body.data).toHaveLength(1);
    expect((await request(app).post(`/admin/v1/campaigns/${f.campaign.id}/sales/${f.record.id}/restore`).set("Authorization", f.auth)).status).toBe(404);
  });

  it("lookup flags the archived row and refuses to correct it", async () => {
    const f = await seedArchiveFixture();
    const lookupBase = `/admin/v1/campaigns/${f.campaign.id}/sales/lookup?outletId=${f.outlet.id}`;
    await request(app).delete(`/admin/v1/campaigns/${f.campaign.id}/sales/${f.record.id}`).set("Authorization", f.auth);

    const archived = await request(app).get(`${lookupBase}&date=${dayDate().toISOString().slice(0, 10)}`).set("Authorization", f.auth);
    expect(archived.body.data[0]).toMatchObject({ id: f.record.id, archived: true, openingStock: 50, soldToday: 20 });

    const patch = await request(app)
      .patch(`/admin/v1/campaigns/${f.campaign.id}/sales/${f.record.id}`)
      .set("Authorization", f.auth)
      .send({ soldToday: 5 });
    expect(patch.status).toBe(400);
    expect(patch.body.error.field).toBe("archivedAt");
  });

  it("promoter stock re-entry updates and unarchives the existing row", async () => {
    const f = await seedArchiveFixture();
    await request(app).delete(`/admin/v1/campaigns/${f.campaign.id}/sales/${f.record.id}`).set("Authorization", f.auth);

    const token = await staffToken(f.staff.mobileUsername, "field-pw");
    await request(app).post("/v1/attendance/check-in").set("Authorization", `Bearer ${token}`).send({ latitude: f.outlet.latitude, longitude: f.outlet.longitude });

    // stock screen treats the archived record as absent (fresh blanks)
    const list = await request(app)
      .get(`/v1/campaigns/${f.campaign.id}/outlets/${f.outlet.id}/products`)
      .set("Authorization", `Bearer ${token}`);
    const cpaId = list.body.data[0].campaignProductAssignmentId;

    const save = await request(app)
      .patch(`/v1/products/${cpaId}/stock`)
      .set("Authorization", `Bearer ${token}`)
      .send({ openingStock: 60, soldToday: 3 });
    expect(save.status).toBe(200);

    const row = await prisma.salesRecord.findUnique({ where: { id: f.record.id } });
    expect(row).toMatchObject({ openingStock: 60, soldToday: 3, archivedAt: null });

    const listAfter = await request(app).get(`/admin/v1/campaigns/${f.campaign.id}/sales`).set("Authorization", f.auth);
    expect(listAfter.body.data[0]).toMatchObject({ openingStock: 60, soldToday: 3 });
  });
});

// Portal side-entry: rows in the Update Sales grid that have no record yet
// (id null) still show Update — the admin fills opening/sold and POSTs a new
// record for the activation item + day (docs/sales-archive-spec.md flow).
describe("POST /admin/v1/campaigns/:id/sales — create for blank grid rows", () => {
  it("creates a record that shows up in the list", async () => {
    const f = await makeCampaignWithActivation(); // no record yet — a blank grid row
    const auth = `Bearer ${await adminToken()}`;
    const res = await request(app)
      .post(`/admin/v1/campaigns/${f.campaign.id}/sales`)
      .set("Authorization", auth)
      .send({ activationItemId: f.activationItem.id, date: dayDate().toISOString().slice(0, 10), openingStock: 20, soldToday: 7 });
    expect(res.status).toBe(201);

    const list = await request(app).get(`/admin/v1/campaigns/${f.campaign.id}/sales`).set("Authorization", auth);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ openingStock: 20, soldToday: 7 });
    // created rows are that day's first stock figure (starting-stock report #91)
    expect((await prisma.salesRecord.findUnique({ where: { id: res.body.data.id } }))!).toMatchObject({
      openingStock: 20,
      soldToday: 7,
      startingStock: 20,
      archivedAt: null,
    });
  });

  it("validates soldToday <= openingStock, rejects duplicates with 409, unknown item with 404", async () => {
    const f = await seedArchiveFixture();
    const url = `/admin/v1/campaigns/${f.campaign.id}/sales`;
    const bad = await request(app).post(url).set("Authorization", f.auth)
      .send({ activationItemId: f.activationItem.id, date: dayDate().toISOString().slice(0, 10), openingStock: 5, soldToday: 7 });
    expect(bad.status).toBe(400);
    expect(bad.body.error.field).toBe("soldToday");

    await request(app).post(url).set("Authorization", f.auth)
      .send({ activationItemId: f.activationItem.id, date: dayDate().toISOString().slice(0, 10), openingStock: 5, soldToday: 0 });
    const again = await request(app).post(url).set("Authorization", f.auth)
      .send({ activationItemId: f.activationItem.id, date: dayDate().toISOString().slice(0, 10), openingStock: 9, soldToday: 2 });
    expect(again.status).toBe(409);

    const stranger = await request(app).post(url).set("Authorization", f.auth)
      .send({ activationItemId: "00000000-0000-4000-8000-000000000000", date: dayDate().toISOString().slice(0, 10), openingStock: 1, soldToday: 0 });
    expect(stranger.status).toBe(404);
  });
});
