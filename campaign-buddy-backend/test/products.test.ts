import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/utils/prisma";
import { app, resetDb, staffToken, adminToken, makeCampaignWithActivation } from "./helpers";

beforeEach(resetDb);

describe("GET /v1/campaigns/:campaignId/outlets/:outletId/products", () => {
  it("lists activation items assigned to the promoter", async () => {
    const { staff, campaign, outlet, activationItem } = await makeCampaignWithActivation();
    const token = await staffToken(staff.mobileUsername, "field-pw");

    const res = await request(app)
      .get(`/v1/campaigns/${campaign.id}/outlets/${outlet.id}/products`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].campaignProductAssignmentId).toBe(activationItem.id);
  });

  // #43 — a portal-created activation started with zero ActivationItems, so the
  // promoter's Products screen was empty until someone hand-built the join rows.
  it("auto-attaches the campaign's items when an activation is created via the admin API", async () => {
    const { staff, campaign, outlet, item } = await makeCampaignWithActivation();
    const admin = await adminToken();

    const created = await request(app)
      .post(`/admin/v1/campaigns/${campaign.id}/activations`)
      .set("Authorization", `Bearer ${admin}`)
      .send({
        name: "Portal-made activation",
        outletId: outlet.id,
        staffId: staff.id,
        supervisorStaffId: null,
        dateFrom: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
        dateTo: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      });
    expect(created.status).toBe(201);

    const items = await request(app)
      .get(`/admin/v1/campaigns/${campaign.id}/activations/${created.body.data.id}/items`)
      .set("Authorization", `Bearer ${admin}`);
    expect(items.body.data.map((r: any) => r.campaignItem.item.name)).toContain(item.name);
  });

  // #43 — items assigned to the campaign after activations exist must reach
  // the promoter on their next open of the Products screen.
  it("includes a campaign item added after the activation was created", async () => {
    const { staff, campaign, outlet } = await makeCampaignWithActivation();
    const admin = await adminToken();

    const item = await prisma.item.create({
      data: { brandId: (await prisma.brand.findFirstOrThrow()).id, sku: "SKU-2", name: "Item 2", unitPrice: 500 },
    });
    const res = await request(app)
      .post(`/admin/v1/campaigns/${campaign.id}/items`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ itemId: item.id });
    expect(res.status).toBe(201);

    const token = await staffToken(staff.mobileUsername, "field-pw");
    const list = await request(app)
      .get(`/v1/campaigns/${campaign.id}/outlets/${outlet.id}/products`)
      .set("Authorization", `Bearer ${token}`);
    expect(list.body.data.map((r: any) => r.product.name)).toContain("Item 2");
  });
});
