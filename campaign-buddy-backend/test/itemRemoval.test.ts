import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/utils/prisma";
import { dayDate } from "../src/utils/dates";
import bcrypt from "bcrypt";
import { app, resetDb, adminToken, staffToken, makeCampaignWithActivation } from "./helpers";

beforeEach(resetDb);

// #111 — removing a product from an activation / campaign must never destroy
// recorded sales. The FK from SalesRecord (and SalesFieldValue) to
// ActivationItem used to be ON DELETE CASCADE.
describe("removing items never deletes recorded sales (#111)", () => {
  it("DELETE activation item keeps its sales records", async () => {
    const { campaign, activation, activationItem } = await makeCampaignWithActivation();
    const sale = await prisma.salesRecord.create({
      data: { activationItemId: activationItem.id, date: dayDate(), soldToday: 7 },
    });

    await request(app)
      .delete(`/admin/v1/campaigns/${campaign.id}/activations/${activation.id}/items/${activationItem.id}`)
      .set("Authorization", `Bearer ${await adminToken()}`);

    expect(await prisma.salesRecord.findUnique({ where: { id: sale.id } })).not.toBeNull();
  });

});

// The delete routes used to look the row up by id alone, so a user with access
// to campaign A could remove an item that belongs to campaign B.
describe("item delete is scoped to the campaign in the URL (#111)", () => {
  it("cannot delete another campaign's activation item or campaign item", async () => {
    const a = await makeCampaignWithActivation();
    const b = await makeCampaignWithActivation();
    const auth = { Authorization: `Bearer ${await adminToken()}` };

    const r1 = await request(app)
      .delete(`/admin/v1/campaigns/${a.campaign.id}/activations/${a.activation.id}/items/${b.activationItem.id}`)
      .set(auth);
    expect(r1.status).toBe(404);
    expect(await prisma.activationItem.count({ where: { id: b.activationItem.id } })).toBe(1);

    const r2 = await request(app)
      .delete(`/admin/v1/campaigns/${a.campaign.id}/items/${b.campaignItem.id}`)
      .set(auth);
    expect(r2.status).toBe(404);
    expect(await prisma.campaignItem.count({ where: { id: b.campaignItem.id } })).toBe(1);
  });
});

// #111 — removal is a soft delete that can be reversed.
describe("item removal is soft and reversible (#111)", () => {
  const base = (campaignId: string) => `/admin/v1/campaigns/${campaignId}`;

  it("activation item: delete hides it, keeps sales, restore brings it back", async () => {
    const { campaign, activation, activationItem } = await makeCampaignWithActivation();
    const auth = { Authorization: `Bearer ${await adminToken()}` };
    const url = `${base(campaign.id)}/activations/${activation.id}/items/${activationItem.id}`;
    const sale = await prisma.salesRecord.create({
      data: { activationItemId: activationItem.id, date: dayDate(), soldToday: 7 },
    });

    expect((await request(app).delete(url).set(auth)).status).toBe(204);
    expect((await prisma.activationItem.findUniqueOrThrow({ where: { id: activationItem.id } })).deletedAt).not.toBeNull();
    expect(await prisma.salesRecord.count({ where: { id: sale.id } })).toBe(1);
    const list = await request(app).get(`${base(campaign.id)}/activations/${activation.id}/items`).set(auth);
    expect(list.body.data).toHaveLength(0);
    expect((await request(app).delete(url).set(auth)).status).toBe(404); // already removed

    const restored = await request(app).post(`${url}/restore`).set(auth);
    expect(restored.status).toBe(200);
    expect(restored.body.data.id).toBe(activationItem.id);
    expect(restored.body.data.deletedAt).toBeNull();
    const back = await request(app).get(`${base(campaign.id)}/activations/${activation.id}/items`).set(auth);
    expect(back.body.data).toHaveLength(1);
    expect((await request(app).post(`${url}/restore`).set(auth)).status).toBe(404); // not deleted
  });

  it("campaign item: delete hides the product everywhere, restore brings it back", async () => {
    const { campaign, activation, campaignItem, activationItem } = await makeCampaignWithActivation();
    const auth = { Authorization: `Bearer ${await adminToken()}` };

    expect((await request(app).delete(`${base(campaign.id)}/items/${campaignItem.id}`).set(auth)).status).toBe(204);
    expect((await request(app).get(`${base(campaign.id)}/items`).set(auth)).body.data).toHaveLength(0);
    expect(
      (await request(app).get(`${base(campaign.id)}/activations/${activation.id}/items`).set(auth)).body.data
    ).toHaveLength(0);
    // the activation item itself is not touched — restoring the product restores it exactly
    expect((await prisma.activationItem.findUniqueOrThrow({ where: { id: activationItem.id } })).deletedAt).toBeNull();

    const restored = await request(app).post(`${base(campaign.id)}/items/${campaignItem.id}/restore`).set(auth);
    expect(restored.status).toBe(200);
    expect((await request(app).get(`${base(campaign.id)}/items`).set(auth)).body.data).toHaveLength(1);
    expect(
      (await request(app).get(`${base(campaign.id)}/activations/${activation.id}/items`).set(auth)).body.data
    ).toHaveLength(1);
  });

  it("restoring an activation item whose campaign item is still removed is 409 PARENT_DELETED", async () => {
    const { campaign, activation, campaignItem, activationItem } = await makeCampaignWithActivation();
    const auth = { Authorization: `Bearer ${await adminToken()}` };
    await prisma.activationItem.update({ where: { id: activationItem.id }, data: { deletedAt: new Date() } });
    await prisma.campaignItem.update({ where: { id: campaignItem.id }, data: { deletedAt: new Date() } });

    const res = await request(app)
      .post(`${base(campaign.id)}/activations/${activation.id}/items/${activationItem.id}/restore`)
      .set(auth);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("PARENT_DELETED");
  });

  it("re-adding a removed product revives the same rows instead of creating or failing", async () => {
    const { campaign, activation, item, campaignItem, activationItem } = await makeCampaignWithActivation();
    const auth = { Authorization: `Bearer ${await adminToken()}` };
    await prisma.activationItem.update({ where: { id: activationItem.id }, data: { deletedAt: new Date() } });
    await prisma.campaignItem.update({ where: { id: campaignItem.id }, data: { deletedAt: new Date() } });

    const addC = await request(app).post(`${base(campaign.id)}/items`).set(auth).send({ itemIds: [item.id] });
    expect(addC.status).toBe(201);
    expect(addC.body.data[0].id).toBe(campaignItem.id);
    const addA = await request(app)
      .post(`${base(campaign.id)}/activations/${activation.id}/items`)
      .set(auth)
      .send({ campaignItemId: campaignItem.id });
    expect(addA.status).toBe(201);
    expect(addA.body.data[0].id).toBe(activationItem.id);
    expect(await prisma.activationItem.count({ where: { activationId: activation.id } })).toBe(1);
    expect((await prisma.activationItem.findUniqueOrThrow({ where: { id: activationItem.id } })).deletedAt).toBeNull();
  });

  it("cannot attach another campaign's product to an activation", async () => {
    const a = await makeCampaignWithActivation();
    const b = await makeCampaignWithActivation();
    const res = await request(app)
      .post(`${base(a.campaign.id)}/activations/${a.activation.id}/items`)
      .set("Authorization", `Bearer ${await adminToken()}`)
      .send({ campaignItemId: b.campaignItem.id });
    expect(res.status).toBe(404);
  });
});

// Mobile: a removed product leaves the promoter's list; a sale recorded from a
// cached (offline) list on the day of removal is still accepted, a later one is
// refused with a clear message instead of a bare 404.
describe("removed products on the mobile app (#111)", () => {
  async function checkedIn() {
    const ctx = await makeCampaignWithActivation();
    const auth = { Authorization: `Bearer ${await staffToken(ctx.staff.mobileUsername, "field-pw")}` };
    const geo = { latitude: ctx.outlet.latitude, longitude: ctx.outlet.longitude };
    await request(app).post("/v1/attendance/check-in").set(auth).send(geo).expect(201);
    return { ...ctx, auth };
  }
  const stock = (auth: Record<string, string>, id: string) =>
    request(app).patch(`/v1/products/${id}/stock`).set(auth).send({ openingStock: 10, soldToday: 2 });

  it("product list omits an activation item or campaign item that was removed", async () => {
    const { auth, campaign, outlet, activationItem, campaignItem } = await checkedIn();
    const list = () =>
      request(app).get(`/v1/campaigns/${campaign.id}/outlets/${outlet.id}/products`).set(auth);
    expect((await list()).body.data).toHaveLength(1);
    await prisma.activationItem.update({ where: { id: activationItem.id }, data: { deletedAt: new Date() } });
    expect((await list()).body.data).toHaveLength(0);
    await prisma.activationItem.update({ where: { id: activationItem.id }, data: { deletedAt: null } });
    await prisma.campaignItem.update({ where: { id: campaignItem.id }, data: { deletedAt: new Date() } });
    expect((await list()).body.data).toHaveLength(0);
  });

  it("accepts a stock write for a product removed earlier the same day", async () => {
    const { auth, activationItem } = await checkedIn();
    await prisma.activationItem.update({ where: { id: activationItem.id }, data: { deletedAt: new Date() } });
    expect((await stock(auth, activationItem.id)).status).toBe(200);
  });

  it("refuses a stock write for a product removed on an earlier day with PRODUCT_REMOVED", async () => {
    const { auth, activationItem } = await checkedIn();
    await prisma.activationItem.update({
      where: { id: activationItem.id },
      data: { deletedAt: new Date(Date.now() - 2 * 86400000) },
    });
    const res = await stock(auth, activationItem.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("PRODUCT_REMOVED");
  });
});

// History is not rewritten: a product removed after it sold keeps counting in reports.
describe("sales totals are unchanged by removing a product (#111)", () => {
  it("sku-wise report is identical before and after the activation item and campaign item are removed", async () => {
    const { campaign, campaignItem, activationItem } = await makeCampaignWithActivation();
    const auth = { Authorization: `Bearer ${await adminToken()}` };
    await prisma.salesRecord.create({
      data: { activationItemId: activationItem.id, date: dayDate(), openingStock: 10, soldToday: 6 },
    });
    const report = async () =>
      (await request(app).get(`/admin/v1/campaigns/${campaign.id}/reports/sku-wise`).set(auth)).body;
    const before = await report();
    expect(JSON.stringify(before)).toContain("6");

    await prisma.activationItem.update({ where: { id: activationItem.id }, data: { deletedAt: new Date() } });
    await prisma.campaignItem.update({ where: { id: campaignItem.id }, data: { deletedAt: new Date() } });
    expect(await report()).toEqual(before);
  });
});

// Access grants keep their hard delete, but the removed grant is returned so
// the client can re-create it exactly (Undo), through a route that re-checks scope.
describe("access-grant removal is reversible (#111)", () => {
  async function setup() {
    const { campaign, outlet } = await makeCampaignWithActivation();
    const other = await prisma.outlet.create({
      data: { outletNo: "O-other", name: "Other", cityId: outlet.cityId, latitude: 6.9, longitude: 79.9 },
    });
    const user = await prisma.user.create({
      data: { username: "u-sub", passwordHash: "x", displayName: "Sub", roleId: "usr" },
    });
    await prisma.campaignAccessGrant.create({
      data: { userId: user.id, campaignId: campaign.id, scopeType: "subset", outletIds: [outlet.id, other.id] },
    });
    return { campaign, outlet, other, user, auth: { Authorization: `Bearer ${await adminToken()}` } };
  }

  it("DELETE returns the removed grant and restore re-creates it exactly", async () => {
    const { campaign, outlet, other, user, auth } = await setup();
    const del = await request(app).delete(`/admin/v1/campaigns/${campaign.id}/admins/${user.id}`).set(auth);
    expect(del.status).toBe(200);
    expect(del.body.data).toMatchObject({ userId: user.id, campaignId: campaign.id, scopeType: "subset" });
    expect([...del.body.data.outletIds].sort()).toEqual([outlet.id, other.id].sort());

    const res = await request(app)
      .post(`/admin/v1/campaigns/${campaign.id}/admins/${user.id}/restore`)
      .set(auth)
      .send({ scopeType: del.body.data.scopeType, outletIds: del.body.data.outletIds });
    expect(res.status).toBe(201);
    const grant = await prisma.campaignAccessGrant.findUniqueOrThrow({
      where: { userId_campaignId: { userId: user.id, campaignId: campaign.id } },
    });
    expect(grant.scopeType).toBe("subset");
    expect([...grant.outletIds].sort()).toEqual([outlet.id, other.id].sort());
  });

  it("restore is 409 when the user already has access, and 400 for a subset with no outlets", async () => {
    const { campaign, user, auth } = await setup();
    const url = `/admin/v1/campaigns/${campaign.id}/admins/${user.id}/restore`;
    expect((await request(app).post(url).set(auth).send({ scopeType: "all" })).status).toBe(409);
    await request(app).delete(`/admin/v1/campaigns/${campaign.id}/admins/${user.id}`).set(auth);
    expect((await request(app).post(url).set(auth).send({ scopeType: "subset", outletIds: [] })).status).toBe(400);
  });

  it("a subset-scoped user cannot restore a grant wider than their own", async () => {
    const { campaign, outlet, other, auth } = await setup();
    const actor = await prisma.user.create({
      data: { username: "actor", passwordHash: await bcrypt.hash("pw", 4), displayName: "Actor", roleId: "usr" },
    });
    await prisma.campaignAccessGrant.create({
      data: { userId: actor.id, campaignId: campaign.id, scopeType: "subset", outletIds: [outlet.id] },
    });
    const actorAuth = {
      Authorization: `Bearer ${(await request(app).post("/admin/v1/auth/login").send({ username: "actor", password: "pw" })).body.data.accessToken}`,
    };
    const target = await prisma.user.create({
      data: { username: "t", passwordHash: "x", displayName: "T", roleId: "supervisor" },
    });
    const url = `/admin/v1/campaigns/${campaign.id}/admins/${target.id}/restore`;
    expect((await request(app).post(url).set(actorAuth).send({ scopeType: "all" })).status).toBe(403);
    expect((await request(app).post(url).set(actorAuth).send({ scopeType: "subset", outletIds: [other.id] })).status).toBe(403);
    expect((await request(app).post(url).set(actorAuth).send({ scopeType: "subset", outletIds: [outlet.id] })).status).toBe(201);
    void auth;
  });

  it("DELETE /users/:id/campaign-access/:campaignId also returns the removed grant", async () => {
    const { campaign, user, auth } = await setup();
    const del = await request(app).delete(`/admin/v1/users/${user.id}/campaign-access/${campaign.id}`).set(auth);
    expect(del.status).toBe(200);
    expect(del.body.data.scopeType).toBe("subset");
    expect(del.body.data.outletIds).toHaveLength(2);
  });
});
