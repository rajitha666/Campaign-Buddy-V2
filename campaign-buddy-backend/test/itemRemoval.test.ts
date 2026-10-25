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

  it("DELETE campaign item that an activation uses is refused with 409", async () => {
    const { campaign, campaignItem } = await makeCampaignWithActivation();
    const res = await request(app)
      .delete(`/admin/v1/campaigns/${campaign.id}/items/${campaignItem.id}`)
      .set("Authorization", `Bearer ${await adminToken()}`);
    expect(res.status).toBe(409);
    expect(await prisma.campaignItem.count({ where: { id: campaignItem.id } })).toBe(1);
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
