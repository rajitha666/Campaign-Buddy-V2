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

describe("sales summary confirm on a zero day", () => {
  // A day with no shoppers is a real day: the promoter must still be able to confirm it
  // (confirming is what lets them check out and move to another outlet).
  it("confirms with nothing logged", async () => {
    const { staff, outlet } = await makeCampaignWithActivation();
    const token = await staffToken(staff.mobileUsername, "field-pw");
    await request(app).post("/v1/attendance/check-in").set("Authorization", `Bearer ${token}`).send({ latitude: outlet.latitude, longitude: outlet.longitude });

    const res = await request(app).post("/v1/sales-summary/today/confirm").set("Authorization", `Bearer ${token}`).send({});
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ confirmed: true, footFall: 0, approached: 0 });
  });

  it("confirms with only some counts logged", async () => {
    const { staff, outlet } = await makeCampaignWithActivation();
    const token = await staffToken(staff.mobileUsername, "field-pw");
    await request(app).post("/v1/attendance/check-in").set("Authorization", `Bearer ${token}`).send({ latitude: outlet.latitude, longitude: outlet.longitude });
    await request(app).patch("/v1/stats/today").set("Authorization", `Bearer ${token}`).send({ footFall: 10 });

    const res = await request(app).post("/v1/sales-summary/today/confirm").set("Authorization", `Bearer ${token}`).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.confirmed).toBe(true);
  });
});

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
    const { campaign, staff, outlet } = await makeCampaignWithActivation();
    await fieldsFor(campaign.id);
    const token = await staffToken(staff.mobileUsername, "field-pw");
    await request(app).post("/v1/attendance/check-in").set("Authorization", `Bearer ${token}`).send({ latitude: outlet.latitude, longitude: outlet.longitude });

    const res = await request(app).patch("/v1/sales-summary/today").set("Authorization", `Bearer ${token}`)
      .send({ customFields: { weather: "Rain", samples: 12 } });
    expect(res.status).toBe(200);
    const byKey = Object.fromEntries(res.body.data.customFields.map((f: any) => [f.key, f.value]));
    expect(byKey).toMatchObject({ weather: "Rain", samples: 12 });
  });

  it("rejects a value that doesn't match the field type", async () => {
    const { campaign, staff, outlet } = await makeCampaignWithActivation();
    await fieldsFor(campaign.id);
    const token = await staffToken(staff.mobileUsername, "field-pw");
    await request(app).post("/v1/attendance/check-in").set("Authorization", `Bearer ${token}`).send({ latitude: outlet.latitude, longitude: outlet.longitude });
    const res = await request(app).patch("/v1/sales-summary/today").set("Authorization", `Bearer ${token}`)
      .send({ customFields: { weather: "Snow" } });
    expect(res.status).toBe(400);
    expect(res.body.error.field).toBe("weather");
  });

  it("confirm is blocked until required day fields are filled, then succeeds", async () => {
    const { campaign, staff, outlet } = await makeCampaignWithActivation();
    await fieldsFor(campaign.id);
    const token = await staffToken(staff.mobileUsername, "field-pw");
    await request(app).post("/v1/attendance/check-in").set("Authorization", `Bearer ${token}`).send({ latitude: outlet.latitude, longitude: outlet.longitude });

    const blocked = await request(app).post("/v1/sales-summary/today/confirm").set("Authorization", `Bearer ${token}`).send({});
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.code).toBe("MISSING_REQUIRED_FIELD");
    await request(app).patch("/v1/stats/today").set("Authorization", `Bearer ${token}`).send({ footFall: 12, approached: 5 });
    const okRes = await request(app).post("/v1/sales-summary/today/confirm").set("Authorization", `Bearer ${token}`)
      .send({ customFields: { samples: 5 } });
    expect(okRes.status).toBe(200);
    expect(okRes.body.data.confirmed).toBe(true);
  });

  it("locks the promoter out of edits once confirmed", async () => {
    const { campaign, staff, outlet } = await makeCampaignWithActivation();
    await fieldsFor(campaign.id);
    const token = await staffToken(staff.mobileUsername, "field-pw");
    await request(app).post("/v1/attendance/check-in").set("Authorization", `Bearer ${token}`).send({ latitude: outlet.latitude, longitude: outlet.longitude });
    await request(app).patch("/v1/stats/today").set("Authorization", `Bearer ${token}`).send({ footFall: 12, approached: 5 });
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
