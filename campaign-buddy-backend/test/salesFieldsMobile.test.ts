import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, resetDb, staffToken, makeCampaignWithActivation } from "./helpers";
import { prisma } from "../src/utils/prisma";

beforeEach(resetDb);

async function fieldsFor(campaignId: string) {
  return {
    weather: await prisma.salesFieldDefinition.create({
      data: { campaignId, key: "weather", label: "Weather", type: "select", scope: "day", options: ["Sunny", "Rain"] },
    }),
    samples: await prisma.salesFieldDefinition.create({
      data: { campaignId, key: "samples", label: "Samples given", type: "number", scope: "day", required: true },
    }),
    damaged: await prisma.salesFieldDefinition.create({
      data: { campaignId, key: "damaged", label: "Damaged units", type: "number", scope: "product" },
    }),
  };
}

describe("mobile custom sales fields", () => {
  it("GET /v1/sales-fields returns day + product defs for the current campaign", async () => {
    const { campaign, staff } = await makeCampaignWithActivation();
    await fieldsFor(campaign.id);
    const token = await staffToken(staff.mobileUsername, "field-pw");

    const res = await request(app).get("/v1/sales-fields").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.day.map((d: any) => d.key).sort()).toEqual(["samples", "weather"]);
    expect(res.body.data.product.map((d: any) => d.key)).toEqual(["damaged"]);
  });

  it("PATCH /v1/sales-summary/today saves day values and echoes them back", async () => {
    const { campaign, staff } = await makeCampaignWithActivation();
    await fieldsFor(campaign.id);
    const token = await staffToken(staff.mobileUsername, "field-pw");

    const res = await request(app).patch("/v1/sales-summary/today").set("Authorization", `Bearer ${token}`)
      .send({ customFields: { weather: "Rain", samples: 12 } });
    expect(res.status).toBe(200);
    const byKey = Object.fromEntries(res.body.data.customFields.map((f: any) => [f.key, f.value]));
    expect(byKey).toMatchObject({ weather: "Rain", samples: 12 });
  });

  it("rejects a value that doesn't match the field type", async () => {
    const { campaign, staff } = await makeCampaignWithActivation();
    await fieldsFor(campaign.id);
    const token = await staffToken(staff.mobileUsername, "field-pw");
    const res = await request(app).patch("/v1/sales-summary/today").set("Authorization", `Bearer ${token}`)
      .send({ customFields: { weather: "Snow" } });
    expect(res.status).toBe(400);
    expect(res.body.error.field).toBe("weather");
  });

  it("confirm is blocked until required day fields are filled, then succeeds", async () => {
    const { campaign, staff } = await makeCampaignWithActivation();
    await fieldsFor(campaign.id);
    const token = await staffToken(staff.mobileUsername, "field-pw");

    const blocked = await request(app).post("/v1/sales-summary/today/confirm").set("Authorization", `Bearer ${token}`).send({});
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.code).toBe("MISSING_REQUIRED_FIELD");

    const okRes = await request(app).post("/v1/sales-summary/today/confirm").set("Authorization", `Bearer ${token}`)
      .send({ customFields: { samples: 5 } });
    expect(okRes.status).toBe(200);
    expect(okRes.body.data.confirmed).toBe(true);
  });

  it("locks the promoter out of edits once confirmed", async () => {
    const { campaign, staff } = await makeCampaignWithActivation();
    await fieldsFor(campaign.id);
    const token = await staffToken(staff.mobileUsername, "field-pw");
    await request(app).post("/v1/sales-summary/today/confirm").set("Authorization", `Bearer ${token}`).send({ customFields: { samples: 5 } });

    const after = await request(app).patch("/v1/sales-summary/today").set("Authorization", `Bearer ${token}`)
      .send({ customFields: { weather: "Sunny" } });
    expect(after.status).toBe(409);
  });

  it("product-scope values round-trip through the stock PATCH + product list", async () => {
    const { campaign, outlet, staff } = await makeCampaignWithActivation();
    await fieldsFor(campaign.id);
    const token = await staffToken(staff.mobileUsername, "field-pw");
    await request(app).post("/v1/attendance/check-in").set("Authorization", `Bearer ${token}`).send({ latitude: outlet.latitude, longitude: outlet.longitude });

    const list = await request(app).get(`/v1/campaigns/${campaign.id}/outlets/${outlet.id}/products`).set("Authorization", `Bearer ${token}`);
    const cpaId = list.body.data[0].campaignProductAssignmentId;
    expect(list.body.data[0].customFields.map((f: any) => f.key)).toEqual(["damaged"]);

    const patch = await request(app).patch(`/v1/products/${cpaId}/stock`).set("Authorization", `Bearer ${token}`)
      .send({ openingStock: 10, soldToday: 2, customFields: { damaged: 3 } });
    expect(patch.status).toBe(200);
    expect(patch.body.data.customFields.find((f: any) => f.key === "damaged").value).toBe(3);

    const relist = await request(app).get(`/v1/campaigns/${campaign.id}/outlets/${outlet.id}/products`).set("Authorization", `Bearer ${token}`);
    expect(relist.body.data[0].customFields.find((f: any) => f.key === "damaged").value).toBe(3);
  });
});
