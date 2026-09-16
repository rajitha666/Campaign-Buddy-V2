import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/utils/prisma";
import { app, resetDb, adminToken, makeCampaignWithActivation } from "./helpers";

beforeEach(resetDb);

async function addItems(campaignId: string, brandId: string, skus: string[]) {
  const itemIds: string[] = [];
  for (const sku of skus) {
    itemIds.push(
      (await prisma.item.create({ data: { brandId, sku, name: sku, unitPrice: 100 } })).id
    );
  }
  return request(app)
    .post(`/admin/v1/campaigns/${campaignId}/items`)
    .set("Authorization", `Bearer ${await adminToken()}`)
    .send({ itemIds });
}

describe("POST /admin/v1/campaigns/:id/items — bulk itemIds activation backfill", () => {
  it("backfills ActivationItems for existing activations (products reach promoters)", async () => {
    const { campaign, activation, brand } = await makeCampaignWithActivation();

    const res = await addItems(campaign.id, brand.id, ["SKU-B1", "SKU-B2"]);
    expect(res.status).toBe(201);

    const rows = await prisma.activationItem.findMany({
      where: { activationId: activation.id },
      include: { campaignItem: { include: { item: true } } },
    });
    expect(rows).toHaveLength(3); // original campaign item + 2 bulk-added
    const skus = rows.map((r) => r.campaignItem.item.sku);
    expect(skus).toContain("SKU-B1");
    expect(skus).toContain("SKU-B2");
  });
});
