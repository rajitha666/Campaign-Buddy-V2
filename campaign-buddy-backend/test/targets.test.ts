import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/utils/prisma";
import { app, resetDb, adminToken, makeCampaignWithActivation } from "./helpers";

beforeEach(resetDb);

describe("Activation targets — progress aggregation (#24)", () => {
  it("item-wise target only counts sales of its own item, not siblings", async () => {
    const token = await adminToken();
    const { campaign, activation, activationItem, item, brand, campaignItem } = await makeCampaignWithActivation();

    // A second item on the same brand + activation — its sales must NOT leak
    // into the item-wise target below.
    const item2 = await prisma.item.create({ data: { brandId: brand.id, sku: "SKU-2", name: "Item 2", unitPrice: 1000 } });
    const campaignItem2 = await prisma.campaignItem.create({ data: { campaignId: campaign.id, itemId: item2.id } });
    const activationItem2 = await prisma.activationItem.create({ data: { activationId: activation.id, campaignItemId: campaignItem2.id } });

    await prisma.salesRecord.create({ data: { activationItemId: activationItem.id, date: activation.dateFrom, openingStock: 100, soldToday: 40 } });
    await prisma.salesRecord.create({ data: { activationItemId: activationItem2.id, date: activation.dateFrom, openingStock: 100, soldToday: 999 } });

    const created = await request(app)
      .post(`/admin/v1/campaigns/${campaign.id}/activations/${activation.id}/targets`)
      .set("Authorization", `Bearer ${token}`)
      .send({ dateFrom: activation.dateFrom.toISOString(), dateTo: activation.dateTo.toISOString(), targetItemId: item.id, targetValue: 100 });
    expect(created.status).toBe(201);
    expect(created.body.data.achieved).toBe(40);
    expect(created.body.data.percent).toBe(40);

    const list = await request(app)
      .get(`/admin/v1/campaigns/${campaign.id}/activations/${activation.id}/targets`)
      .set("Authorization", `Bearer ${token}`);
    expect(list.body.data[0].achieved).toBe(40);
  });

  it("brand-wise target is met by combined sales across all the brand's SKUs", async () => {
    const token = await adminToken();
    const { campaign, activation, activationItem, brand } = await makeCampaignWithActivation();

    const item2 = await prisma.item.create({ data: { brandId: brand.id, sku: "SKU-2", name: "Item 2", unitPrice: 1000 } });
    const campaignItem2 = await prisma.campaignItem.create({ data: { campaignId: campaign.id, itemId: item2.id } });
    const activationItem2 = await prisma.activationItem.create({ data: { activationId: activation.id, campaignItemId: campaignItem2.id } });

    const item3 = await prisma.item.create({ data: { brandId: brand.id, sku: "SKU-3", name: "Item 3", unitPrice: 1000 } });
    const campaignItem3 = await prisma.campaignItem.create({ data: { campaignId: campaign.id, itemId: item3.id } });
    const activationItem3 = await prisma.activationItem.create({ data: { activationId: activation.id, campaignItemId: campaignItem3.id } });

    await request(app)
      .patch(`/admin/v1/campaigns/${campaign.id}/activations/${activation.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ targetType: "brand_wise" });

    await prisma.salesRecord.create({ data: { activationItemId: activationItem.id, date: activation.dateFrom, openingStock: 100, soldToday: 40 } });
    await prisma.salesRecord.create({ data: { activationItemId: activationItem2.id, date: activation.dateFrom, openingStock: 100, soldToday: 35 } });
    await prisma.salesRecord.create({ data: { activationItemId: activationItem3.id, date: activation.dateFrom, openingStock: 100, soldToday: 25 } });

    const created = await request(app)
      .post(`/admin/v1/campaigns/${campaign.id}/activations/${activation.id}/targets`)
      .set("Authorization", `Bearer ${token}`)
      .send({ dateFrom: activation.dateFrom.toISOString(), dateTo: activation.dateTo.toISOString(), targetBrandId: brand.id, targetValue: 100 });
    expect(created.status).toBe(201);
    expect(created.body.data.achieved).toBe(100);
    expect(created.body.data.percent).toBe(100);
  });

  it("400s when the wrong target field is used for the activation's target type", async () => {
    const token = await adminToken();
    const { campaign, activation, item, brand } = await makeCampaignWithActivation();

    const itemWise = await request(app)
      .post(`/admin/v1/campaigns/${campaign.id}/activations/${activation.id}/targets`)
      .set("Authorization", `Bearer ${token}`)
      .send({ dateFrom: activation.dateFrom.toISOString(), dateTo: activation.dateTo.toISOString(), targetBrandId: brand.id, targetValue: 100 });
    expect(itemWise.status).toBe(400);

    await request(app)
      .patch(`/admin/v1/campaigns/${campaign.id}/activations/${activation.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ targetType: "brand_wise" });

    const brandWise = await request(app)
      .post(`/admin/v1/campaigns/${campaign.id}/activations/${activation.id}/targets`)
      .set("Authorization", `Bearer ${token}`)
      .send({ dateFrom: activation.dateFrom.toISOString(), dateTo: activation.dateTo.toISOString(), targetItemId: item.id, targetValue: 100 });
    expect(brandWise.status).toBe(400);
  });

  it("400s when targetBrandId has no items on this activation", async () => {
    const token = await adminToken();
    const { campaign, activation, client } = await makeCampaignWithActivation();
    await request(app)
      .patch(`/admin/v1/campaigns/${campaign.id}/activations/${activation.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ targetType: "brand_wise" });

    const otherBrand = await prisma.brand.create({ data: { name: "Other", clientId: client.id } });
    const res = await request(app)
      .post(`/admin/v1/campaigns/${campaign.id}/activations/${activation.id}/targets`)
      .set("Authorization", `Bearer ${token}`)
      .send({ dateFrom: activation.dateFrom.toISOString(), dateTo: activation.dateTo.toISOString(), targetBrandId: otherBrand.id, targetValue: 100 });
    expect(res.status).toBe(400);
  });
});
