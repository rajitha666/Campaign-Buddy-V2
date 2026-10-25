import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/utils/prisma";
import { dayDate } from "../src/utils/dates";
import { app, resetDb, adminToken, makeCampaignWithActivation } from "./helpers";

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
