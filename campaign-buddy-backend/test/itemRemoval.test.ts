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
