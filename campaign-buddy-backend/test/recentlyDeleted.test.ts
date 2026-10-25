import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { prisma } from "../src/utils/prisma";
import { app, resetDb, adminToken, makeCampaignWithActivation, makeStaff } from "./helpers";

beforeEach(resetDb);

const A = "/admin/v1";
const authAdmin = async () => ({ Authorization: `Bearer ${await adminToken()}` });

async function login(username: string, roleId: string) {
  const u = await prisma.user.create({
    data: { username, passwordHash: await bcrypt.hash("pw", 4), displayName: `${username} name`, roleId },
  });
  const token = (await request(app).post(`${A}/auth/login`).send({ username, password: "pw" })).body.data.accessToken;
  return { u, h: { Authorization: `Bearer ${token}` } };
}
const adminUser = () => prisma.user.findFirstOrThrow({ where: { username: "admin" } });

describe("deletion events (#113)", () => {
  it("a successful delete and restore each record who did it; a failed one records nothing", async () => {
    const h = await authAdmin();
    const city = await prisma.city.create({ data: { name: "Galle", province: "S", district: "Galle" } });
    await request(app).delete(`${A}/cities/does-not-exist`).set(h).expect(404);
    expect(await prisma.deletionEvent.count()).toBe(0);

    await request(app).delete(`${A}/cities/${city.id}`).set(h).expect(200);
    await request(app).post(`${A}/cities/${city.id}/restore`).set(h).expect(200);
    const events = await prisma.deletionEvent.findMany({ orderBy: { at: "asc" } });
    const adminId = (await adminUser()).id;
    expect(events.map((e) => [e.entityType, e.entityId, e.action, e.userId])).toEqual([
      ["city", city.id, "delete", adminId],
      ["city", city.id, "restore", adminId],
    ]);
  });

  it("campaign-scoped events carry the campaign; staff deactivate/reactivate are recorded", async () => {
    const h = await authAdmin();
    const { campaign, activation } = await makeCampaignWithActivation();
    await request(app).delete(`${A}/campaigns/${campaign.id}/activations/${activation.id}`).set(h).expect(200);
    const staff = await makeStaff();
    await request(app).delete(`${A}/staff/${staff.id}`).set(h).expect(200);
    await request(app).post(`${A}/staff/${staff.id}/reactivate`).set(h).expect(200);
    const ev = await prisma.deletionEvent.findMany({ orderBy: { at: "asc" } });
    expect(ev.map((e) => `${e.entityType}:${e.action}`)).toEqual(["activation:delete", "staff:delete", "staff:restore"]);
    expect(ev[0].campaignId).toBe(campaign.id);
  });
});

describe("GET /deleted (#113)", () => {
  it("lists a deleted record with who/when and a restore path that works; legacy rows show no deleter", async () => {
    const h = await authAdmin();
    const city = await prisma.city.create({ data: { name: "Kandy", province: "C", district: "Kandy" } });
    const legacy = await prisma.city.create({
      data: { name: "Old", province: "C", district: "Kandy", deletedAt: new Date(Date.now() - 86400000) },
    });
    await request(app).delete(`${A}/cities/${city.id}`).set(h).expect(200);

    const res = await request(app).get(`${A}/deleted?entity=city`).set(h);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(2);
    const row = res.body.data.find((r: any) => r.id === city.id);
    expect(row).toMatchObject({ entity: "city", label: "Kandy", canRestore: true, deletedBy: { displayName: expect.any(String) } });
    expect(res.body.data.find((r: any) => r.id === legacy.id).deletedBy).toBeNull();
    expect(res.body.data[0].id).toBe(city.id); // newest first

    const restored = await request(app).post(`${A}${row.restore.path}`).set(h);
    expect(restored.status).toBe(200);
    expect((await request(app).get(`${A}/deleted?entity=city`).set(h)).body.meta.total).toBe(1);
  });

  it("says when a restore is blocked because its parent is still deleted", async () => {
    const h = await authAdmin();
    const client = await prisma.client.create({ data: { companyName: "Co", clientName: "C", deletedAt: new Date() } });
    await prisma.brand.create({ data: { name: "B", clientId: client.id, deletedAt: new Date() } });
    const res = await request(app).get(`${A}/deleted?entity=brand`).set(h);
    expect(res.body.data[0]).toMatchObject({ canRestore: false, blockedBy: { code: "PARENT_DELETED", parent: "client" } });
  });

  it("filters by q, paginates, and rejects an unknown entity", async () => {
    const h = await authAdmin();
    for (const n of ["Alpha", "Beta", "Gamma"]) {
      await prisma.city.create({ data: { name: n, province: "P", district: "D", deletedAt: new Date() } });
    }
    expect((await request(app).get(`${A}/deleted?entity=city&q=bet`).set(h)).body.data.map((r: any) => r.label)).toEqual(["Beta"]);
    const page = await request(app).get(`${A}/deleted?entity=city&page=2&pageSize=2`).set(h);
    expect(page.body.data).toHaveLength(1);
    expect(page.body.meta.total).toBe(3);
    expect((await request(app).get(`${A}/deleted?entity=nope`).set(h)).status).toBe(400);
  });

  it("a deleted staff member is listed by name and employee ID with no personal data", async () => {
    const h = await authAdmin();
    const staff = await makeStaff({ nic: "901234567V", phone: "0771234567" } as any);
    await request(app).delete(`${A}/staff/${staff.id}`).set(h).expect(200);
    const res = await request(app).get(`${A}/deleted?entity=staff`).set(h);
    expect(res.body.data[0].label).toContain(staff.employeeId);
    expect(JSON.stringify(res.body)).not.toMatch(/901234567V|0771234567/);
  });

  it("supervisors and sponsors cannot reach either endpoint", async () => {
    const { campaign } = await makeCampaignWithActivation();
    for (const role of ["supervisor", "sponsor"]) {
      const { u, h } = await login(`${role}1`, role);
      await prisma.campaignAccessGrant.create({ data: { userId: u.id, campaignId: campaign.id, scopeType: "all", outletIds: [] } });
      expect((await request(app).get(`${A}/deleted`).set(h)).status).toBe(403);
      expect((await request(app).get(`${A}/campaigns/${campaign.id}/deleted`).set(h)).status).toBe(403);
    }
  });
});

describe("GET /campaigns/:id/deleted (#113)", () => {
  it("lists campaign items, activations and activation items; respects campaign access and outlet scope", async () => {
    const h = await authAdmin();
    const { campaign, activation, activationItem, campaignItem } = await makeCampaignWithActivation();
    await request(app).delete(`${A}/campaigns/${campaign.id}/activations/${activation.id}/items/${activationItem.id}`).set(h).expect(204);
    await request(app).delete(`${A}/campaigns/${campaign.id}/items/${campaignItem.id}`).set(h).expect(204);
    await request(app).delete(`${A}/campaigns/${campaign.id}/activations/${activation.id}`).set(h).expect(200);

    const res = await request(app).get(`${A}/campaigns/${campaign.id}/deleted`).set(h);
    expect(res.status).toBe(200);
    expect(res.body.data.map((r: any) => r.entity).sort()).toEqual(["activation", "activation_item", "campaign_item"]);
    const act = res.body.data.find((r: any) => r.entity === "activation");
    expect(act.restore.path).toBe(`/campaigns/${campaign.id}/activations/${activation.id}/restore`);
    expect(act.deletedBy).not.toBeNull();

    // a usr with no grant is refused; one scoped to other outlets does not see outlet-bound rows
    const noGrant = await login("usr-no", "usr");
    expect((await request(app).get(`${A}/campaigns/${campaign.id}/deleted`).set(noGrant.h)).status).toBe(403);
    const scoped = await login("usr-scoped", "usr");
    await prisma.campaignAccessGrant.create({
      data: { userId: scoped.u.id, campaignId: campaign.id, scopeType: "subset", outletIds: ["other-outlet"] },
    });
    const seen = await request(app).get(`${A}/campaigns/${campaign.id}/deleted`).set(scoped.h);
    expect(seen.status).toBe(200);
    expect(seen.body.data.map((r: any) => r.entity)).toEqual(["campaign_item"]);
  });
});
