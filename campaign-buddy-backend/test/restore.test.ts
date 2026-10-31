import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/utils/prisma";
import { app, resetDb, adminToken, makeCampaignWithActivation, makeStaff } from "./helpers";

beforeEach(resetDb);

const A = "/admin/v1";
async function auth() {
  return { Authorization: `Bearer ${await adminToken()}` };
}

async function catalog() {
  const client = await prisma.client.create({ data: { companyName: "Co", clientName: "C" } });
  const brand = await prisma.brand.create({ data: { name: "B", clientId: client.id } });
  const item = await prisma.item.create({ data: { brandId: brand.id, sku: "SKU-1", name: "I", unitPrice: 1 } });
  const city = await prisma.city.create({ data: { name: "City", province: "P", district: "D" } });
  const outlet = await prisma.outlet.create({
    data: { outletNo: "O-1", name: "Out", cityId: city.id, latitude: 6.9, longitude: 79.9 },
  });
  const dp = await prisma.distributorPoint.create({ data: { name: "DP", cityId: city.id, clientId: client.id } });
  return { client, brand, item, city, outlet, dp };
}

describe("catalog restore (#110)", () => {
  it.each([
    ["clients", "client"],
    ["brands", "brand"],
    ["items", "item"],
    ["cities", "city"],
    ["outlets", "outlet"],
    ["distributor-points", "dp"],
  ] as const)("%s: delete -> restore brings the row back; double restore is 404", async (path, key) => {
    const c: any = await catalog();
    const h = await auth();
    expect((await request(app).delete(`${A}/${path}/${c[key].id}`).set(h)).status).toBe(200);
    const list = await request(app).get(`${A}/${path}`).set(h);
    expect(JSON.stringify(list.body.data)).not.toContain(c[key].id);

    const res = await request(app).post(`${A}/${path}/${c[key].id}/restore`).set(h);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: c[key].id, deletedAt: null, softDeleted: false });
    expect(JSON.stringify((await request(app).get(`${A}/${path}`).set(h)).body.data)).toContain(c[key].id);
    expect((await request(app).post(`${A}/${path}/${c[key].id}/restore`).set(h)).status).toBe(404);
  });

  it("unknown id is 404", async () => {
    expect((await request(app).post(`${A}/clients/nope/restore`).set(await auth())).status).toBe(404);
  });

  it.each([
    ["brands", "brand", "client"],
    ["items", "item", "brand"],
    ["outlets", "outlet", "city"],
    ["distributor-points", "dp", "city"],
  ] as const)("%s: restore under a deleted parent is 409 PARENT_DELETED", async (path, key, parent) => {
    const c: any = await catalog();
    const model = { client: prisma.client, brand: prisma.brand, city: prisma.city }[parent] as any;
    await (prisma as any)[{ brands: "brand", items: "item", outlets: "outlet", "distributor-points": "distributorPoint" }[path]!].update({
      where: { id: c[key].id }, data: { deletedAt: new Date() },
    });
    await model.update({ where: { id: c[parent].id }, data: { deletedAt: new Date() } });
    const res = await request(app).post(`${A}/${path}/${c[key].id}/restore`).set(await auth());
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("PARENT_DELETED");
  });

  it("restoring an item/outlet whose code was re-used meanwhile is 409 CODE_IN_USE", async () => {
    const c = await catalog();
    const h = await auth();
    await request(app).delete(`${A}/items/${c.item.id}`).set(h);
    await prisma.item.create({ data: { brandId: c.brand.id, sku: "SKU-1", name: "new", unitPrice: 1 } });
    const r1 = await request(app).post(`${A}/items/${c.item.id}/restore`).set(h);
    expect(r1.status).toBe(409);
    expect(r1.body.error.code).toBe("CODE_IN_USE");

    await request(app).delete(`${A}/outlets/${c.outlet.id}`).set(h);
    await prisma.outlet.create({ data: { outletNo: "O-1", name: "new", cityId: c.city.id, latitude: 6.9, longitude: 79.9 } });
    const r2 = await request(app).post(`${A}/outlets/${c.outlet.id}/restore`).set(h);
    expect(r2.status).toBe(409);
    expect(r2.body.error.code).toBe("CODE_IN_USE");
  });
});

describe("campaign-scoped restore (#110)", () => {
  const C = (id: string) => `${A}/campaigns/${id}`;

  it("campaign: delete -> restore; 409 if the client is deleted", async () => {
    const { campaign, client } = await makeCampaignWithActivation();
    const h = await auth();
    await request(app).delete(C(campaign.id)).set(h).expect(200);
    const res = await request(app).post(`${C(campaign.id)}/restore`).set(h);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: campaign.id, deletedAt: null, softDeleted: false });
    expect((await request(app).post(`${C(campaign.id)}/restore`).set(h)).status).toBe(404);

    await prisma.campaign.update({ where: { id: campaign.id }, data: { deletedAt: new Date() } });
    await prisma.client.update({ where: { id: client.id }, data: { deletedAt: new Date() } });
    const r2 = await request(app).post(`${C(campaign.id)}/restore`).set(h);
    expect(r2.status).toBe(409);
    expect(r2.body.error.code).toBe("PARENT_DELETED");
  });

  it("campaign: a campaignNo re-used meanwhile is 409 CODE_IN_USE", async () => {
    const { campaign, client } = await makeCampaignWithActivation();
    const h = await auth();
    await request(app).delete(C(campaign.id)).set(h);
    await prisma.campaign.create({
      data: { campaignNo: campaign.campaignNo, name: "new", clientId: client.id, startDate: campaign.startDate, endDate: campaign.endDate },
    });
    const res = await request(app).post(`${C(campaign.id)}/restore`).set(h);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CODE_IN_USE");
  });

  it("activation: delete -> restore; wrong campaign 404; deleted outlet 409; inactive promoter is allowed", async () => {
    const a = await makeCampaignWithActivation();
    const b = await makeCampaignWithActivation();
    const h = await auth();
    const url = (c: string, act: string) => `${C(c)}/activations/${act}`;
    await request(app).delete(url(a.campaign.id, a.activation.id)).set(h).expect(200);

    expect((await request(app).post(`${url(b.campaign.id, a.activation.id)}/restore`).set(h)).status).toBe(404);
    await prisma.outlet.update({ where: { id: a.outlet.id }, data: { deletedAt: new Date() } });
    const blocked = await request(app).post(`${url(a.campaign.id, a.activation.id)}/restore`).set(h);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("PARENT_DELETED");
    await prisma.outlet.update({ where: { id: a.outlet.id }, data: { deletedAt: null } });

    await prisma.staff.update({ where: { id: a.staff.id }, data: { status: "inactive" } });
    const res = await request(app).post(`${url(a.campaign.id, a.activation.id)}/restore`).set(h);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: a.activation.id, deletedAt: null, softDeleted: false });
    expect((await request(app).post(`${url(a.campaign.id, a.activation.id)}/restore`).set(h)).status).toBe(404);
  });

  it("supervisor route and task: delete -> restore, scoped to the campaign", async () => {
    const a = await makeCampaignWithActivation();
    const b = await makeCampaignWithActivation();
    const h = await auth();
    const sup = await makeStaff({ userType: "supervisor" } as any);
    const route = await prisma.supervisorRoute.create({
      data: { campaignId: a.campaign.id, supervisorStaffId: sup.id, outletIds: [a.outlet.id], dateFrom: a.campaign.startDate, dateTo: a.campaign.endDate },
    });
    const task = await prisma.supervisorTask.create({
      data: { campaignId: a.campaign.id, category: "Display", taskType: "feedback" as any, task: "Is display set?" },
    });
    for (const [seg, id] of [["supervisor-routes", route.id], ["supervisor-tasks", task.id]] as const) {
      await request(app).delete(`${C(a.campaign.id)}/${seg}/${id}`).set(h).expect(200);
      expect((await request(app).post(`${C(b.campaign.id)}/${seg}/${id}/restore`).set(h)).status).toBe(404);
      const res = await request(app).post(`${C(a.campaign.id)}/${seg}/${id}/restore`).set(h);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ id, deletedAt: null, softDeleted: false });
      expect((await request(app).post(`${C(a.campaign.id)}/${seg}/${id}/restore`).set(h)).status).toBe(404);
    }
  });

  it("custom sales field: archive -> restore", async () => {
    const { campaign } = await makeCampaignWithActivation();
    const h = await auth();
    const field = await prisma.salesFieldDefinition.create({
      data: { campaignId: campaign.id, key: "f1", label: "F1", type: "number" as any },
    });
    await request(app).delete(`${C(campaign.id)}/sales-fields/${field.id}`).set(h).expect(200);
    const res = await request(app).post(`${C(campaign.id)}/sales-fields/${field.id}/restore`).set(h);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(field.id);
    expect(res.body.data.archivedAt ?? null).toBeNull();
    expect((await request(app).post(`${C(campaign.id)}/sales-fields/${field.id}/restore`).set(h)).status).toBe(404);
  });
});

describe("staff reactivate (#110)", () => {
  it("delete -> reactivate; only works while inactive", async () => {
    const staff = await makeStaff();
    const h = await auth();
    expect((await request(app).post(`${A}/staff/${staff.id}/reactivate`).set(h)).status).toBe(404); // active
    await request(app).delete(`${A}/staff/${staff.id}`).set(h).expect(200);
    const res = await request(app).post(`${A}/staff/${staff.id}/reactivate`).set(h);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("active");
    expect((await request(app).post(`${A}/staff/${staff.id}/reactivate`).set(h)).status).toBe(404);
  });

  it("409 DUPLICATE when the phone number now belongs to another active member", async () => {
    const h = await auth();
    const first = await makeStaff({ phone: "0771234567" } as any);
    await request(app).delete(`${A}/staff/${first.id}`).set(h).expect(200);
    await makeStaff({ phone: "0771234567" } as any);
    const res = await request(app).post(`${A}/staff/${first.id}/reactivate`).set(h);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("DUPLICATE");
  });

  it("supervisor tokens are read-only (403)", async () => {
    const staff = await makeStaff({ status: "inactive" } as any);
    const sup = await prisma.user.create({ data: { username: "sup1", passwordHash: await (await import("bcrypt")).hash("pw", 4), displayName: "S", roleId: "supervisor" } });
    void sup;
    const token = (await request(app).post(`${A}/auth/login`).send({ username: "sup1", password: "pw" })).body.data.accessToken;
    const res = await request(app).post(`${A}/staff/${staff.id}/reactivate`).set({ Authorization: `Bearer ${token}` });
    expect(res.status).toBe(403);
  });
});

describe("restore keeps the delete's access rules (#110)", () => {
  it("an outlet-scoped user cannot restore an activation outside their outlets; a supervisor gets 403", async () => {
    const { campaign, activation } = await makeCampaignWithActivation();
    await prisma.activation.update({ where: { id: activation.id }, data: { deletedAt: new Date() } });
    const bcrypt = (await import("bcrypt")).default;
    const mk = async (username: string, roleId: string) => {
      const u = await prisma.user.create({ data: { username, passwordHash: await bcrypt.hash("pw", 4), displayName: username, roleId } });
      const token = (await request(app).post(`${A}/auth/login`).send({ username, password: "pw" })).body.data.accessToken;
      return { u, h: { Authorization: `Bearer ${token}` } };
    };
    const scoped = await mk("scoped", "usr");
    await prisma.campaignAccessGrant.create({
      data: { userId: scoped.u.id, campaignId: campaign.id, scopeType: "subset", outletIds: ["some-other-outlet"] },
    });
    const url = `${A}/campaigns/${campaign.id}/activations/${activation.id}/restore`;
    expect((await request(app).post(url).set(scoped.h)).status).toBe(403);

    const sup = await mk("sup2", "supervisor");
    await prisma.campaignAccessGrant.create({ data: { userId: sup.u.id, campaignId: campaign.id, scopeType: "all", outletIds: [] } });
    expect((await request(app).post(url).set(sup.h)).status).toBe(403);
    expect((await prisma.activation.findUniqueOrThrow({ where: { id: activation.id } })).deletedAt).not.toBeNull();
  });
});

describe("restore roles and deleted campaigns (#110)", () => {
  async function login(username: string, roleId: string) {
    const bcrypt = (await import("bcrypt")).default;
    const u = await prisma.user.create({ data: { username, passwordHash: await bcrypt.hash("pw", 4), displayName: username, roleId } });
    const token = (await request(app).post(`${A}/auth/login`).send({ username, password: "pw" })).body.data.accessToken;
    return { u, h: { Authorization: `Bearer ${token}` } };
  }

  it("a sponsor token cannot restore (403)", async () => {
    const { campaign } = await makeCampaignWithActivation();
    await prisma.campaign.update({ where: { id: campaign.id }, data: { deletedAt: new Date() } });
    const sp = await login("sponsor1", "sponsor");
    await prisma.campaignAccessGrant.create({ data: { userId: sp.u.id, campaignId: campaign.id, scopeType: "all", outletIds: [] } });
    expect((await request(app).post(`${A}/campaigns/${campaign.id}/restore`).set(sp.h)).status).toBe(403);
  });

  it("a usr who holds a grant can restore a deleted campaign", async () => {
    const { campaign } = await makeCampaignWithActivation();
    await prisma.campaign.update({ where: { id: campaign.id }, data: { deletedAt: new Date() } });
    const usr = await login("usr9", "usr");
    await prisma.campaignAccessGrant.create({ data: { userId: usr.u.id, campaignId: campaign.id, scopeType: "all", outletIds: [] } });
    const res = await request(app).post(`${A}/campaigns/${campaign.id}/restore`).set(usr.h);
    expect(res.status).toBe(200);
    expect(res.body.data.deletedAt).toBeNull();
  });
});
