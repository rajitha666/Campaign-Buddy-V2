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

// Soft-deleted items must not come back attached to a campaign or activation —
// GET items feeds the profile/attach pickers in CB Office, so a deleted record
// would appear selectable in those dropdowns.
describe("GET campaign/activation items — soft-deleted items hidden", () => {
  it("GET /campaigns/:id/items excludes a soft-deleted item", async () => {
    const { campaign, item } = await makeCampaignWithActivation();
    await prisma.item.update({ where: { id: item.id }, data: { deletedAt: new Date() } });

    const res = await request(app)
      .get(`/admin/v1/campaigns/${campaign.id}/items`)
      .set("Authorization", `Bearer ${await adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it("GET activations/:id/items excludes a soft-deleted item", async () => {
    const { campaign, activation, item } = await makeCampaignWithActivation();
    await prisma.item.update({ where: { id: item.id }, data: { deletedAt: new Date() } });

    const res = await request(app)
      .get(`/admin/v1/campaigns/${campaign.id}/activations/${activation.id}/items`)
      .set("Authorization", `Bearer ${await adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it("keeps live items alongside the deleted one", async () => {
    const { campaign, brand, item } = await makeCampaignWithActivation();
    await addItems(campaign.id, brand.id, ["SKU-LIVE"]);
    await prisma.item.update({ where: { id: item.id }, data: { deletedAt: new Date() } });

    const res = await request(app)
      .get(`/admin/v1/campaigns/${campaign.id}/items`)
      .set("Authorization", `Bearer ${await adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((r: any) => r.item.sku)).toEqual(["SKU-LIVE"]);
  });
});
