import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, resetDb, adminToken, makeCampaignWithActivation } from "./helpers";
import { prisma } from "../src/utils/prisma";

beforeEach(resetDb);

const today = new Date().toISOString().slice(0, 10);

async function setup() {
  const ctx = await makeCampaignWithActivation();
  const token = await adminToken();
  const base = `/admin/v1/campaigns/${ctx.campaign.id}/sales-fields`;
  return { ...ctx, token, base };
}

describe("admin custom sales fields — CRUD", () => {
  it("creates a field, auto-slugging the key from the label", async () => {
    const { token, base } = await setup();
    const res = await request(app).post(base).set("Authorization", `Bearer ${token}`)
      .send({ label: "Competitor Promo?", type: "boolean", scope: "day" });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ key: "competitor_promo", label: "Competitor Promo?", type: "boolean", scope: "day", required: false });
  });

  it("rejects a dropdown with fewer than two options", async () => {
    const { token, base } = await setup();
    const res = await request(app).post(base).set("Authorization", `Bearer ${token}`)
      .send({ label: "Weather", type: "select", options: ["Sunny"] });
    expect(res.status).toBe(400);
    expect(res.body.error.field).toBe("options");
  });

  it("409s on a duplicate key within the campaign", async () => {
    const { token, base } = await setup();
    await request(app).post(base).set("Authorization", `Bearer ${token}`).send({ label: "Samples given", type: "number" });
    const dup = await request(app).post(base).set("Authorization", `Bearer ${token}`).send({ label: "Samples  given", type: "number" });
    expect(dup.status).toBe(409);
  });

  it("lists non-archived by default, ordered by sortOrder", async () => {
    const { token, base } = await setup();
    await request(app).post(base).set("Authorization", `Bearer ${token}`).send({ label: "B field", type: "text", sortOrder: 2 });
    const a = await request(app).post(base).set("Authorization", `Bearer ${token}`).send({ label: "A field", type: "text", sortOrder: 1 });
    await request(app).patch(`${base}/${a.body.data.id}`).set("Authorization", `Bearer ${token}`).send({ archived: true });

    const list = await request(app).get(base).set("Authorization", `Bearer ${token}`);
    expect(list.body.data.map((f: any) => f.label)).toEqual(["B field"]);

    const all = await request(app).get(`${base}?includeArchived=1`).set("Authorization", `Bearer ${token}`);
    expect(all.body.data).toHaveLength(2);
    expect(all.body.data.find((f: any) => f.label === "A field").archived).toBe(true);
  });

  it("blocks a type change once the field has values, but allows it before", async () => {
    const { token, base, activation } = await setup();
    const f = await request(app).post(base).set("Authorization", `Bearer ${token}`).send({ label: "Notes", type: "text", scope: "day" });
    const id = f.body.data.id;

    const ok = await request(app).patch(`${base}/${id}`).set("Authorization", `Bearer ${token}`).send({ type: "number" });
    expect(ok.status).toBe(200);

    await prisma.salesFieldValue.create({ data: { definitionId: id, activationId: activation.id, date: new Date(`${today}T00:00:00Z`), value: "1" } });
    const blocked = await request(app).patch(`${base}/${id}`).set("Authorization", `Bearer ${token}`).send({ type: "text" });
    expect(blocked.status).toBe(409);
  });

  it("won't hard-delete a field with values; deletes a clean one", async () => {
    const { token, base, activation } = await setup();
    const f = await request(app).post(base).set("Authorization", `Bearer ${token}`).send({ label: "Keep", type: "number" });
    const id = f.body.data.id;
    await prisma.salesFieldValue.create({ data: { definitionId: id, activationId: activation.id, date: new Date(`${today}T00:00:00Z`), value: "3" } });

    const blocked = await request(app).delete(`${base}/${id}`).set("Authorization", `Bearer ${token}`);
    expect(blocked.status).toBe(409);

    const g = await request(app).post(base).set("Authorization", `Bearer ${token}`).send({ label: "Gone", type: "number" });
    const del = await request(app).delete(`${base}/${g.body.data.id}`).set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(204);
  });
});

describe("admin custom sales fields — bulk value save", () => {
  it("saves day + product values and clears with null", async () => {
    const { token, campaign, activation, activationItem } = await setup();
    const base = `/admin/v1/campaigns/${campaign.id}/sales-fields`;
    const wx = await request(app).post(base).set("Authorization", `Bearer ${token}`).send({ label: "Weather", type: "select", scope: "day", options: ["Sunny", "Rain"] });
    const dmg = await request(app).post(base).set("Authorization", `Bearer ${token}`).send({ label: "Damaged units", type: "number", scope: "product" });

    const url = `/admin/v1/campaigns/${campaign.id}/sales/custom-values`;
    const save = await request(app).put(url).set("Authorization", `Bearer ${token}`).send({
      activationId: activation.id,
      date: today,
      day: { weather: "Rain" },
      products: { [activationItem.id]: { damaged_units: 4 } },
    });
    expect(save.status).toBe(200);
    expect(await prisma.salesFieldValue.count()).toBe(2);

    const clear = await request(app).put(url).set("Authorization", `Bearer ${token}`).send({
      activationId: activation.id, date: today, day: { weather: null },
    });
    expect(clear.status).toBe(200);
    expect(await prisma.salesFieldValue.findFirst({ where: { definitionId: wx.body.data.id } })).toBeNull();
    // product value untouched
    expect(await prisma.salesFieldValue.count({ where: { definitionId: dmg.body.data.id } })).toBe(1);
  });

  it("rejects a value that doesn't match the field type", async () => {
    const { token, campaign, activation } = await setup();
    const base = `/admin/v1/campaigns/${campaign.id}/sales-fields`;
    await request(app).post(base).set("Authorization", `Bearer ${token}`).send({ label: "Samples", type: "number", scope: "day" });
    const res = await request(app).put(`/admin/v1/campaigns/${campaign.id}/sales/custom-values`).set("Authorization", `Bearer ${token}`)
      .send({ activationId: activation.id, date: today, day: { samples: "lots" } });
    expect(res.status).toBe(400);
    expect(res.body.error.field).toBe("samples");
  });

  it("sales/lookup carries per-row customFields + meta.dayCustomFields", async () => {
    const { token, campaign, activation } = await setup();
    const base = `/admin/v1/campaigns/${campaign.id}/sales-fields`;
    await request(app).post(base).set("Authorization", `Bearer ${token}`).send({ label: "Weather", type: "text", scope: "day" });
    await request(app).post(base).set("Authorization", `Bearer ${token}`).send({ label: "Damaged", type: "number", scope: "product" });

    const res = await request(app).get(`/admin/v1/campaigns/${campaign.id}/sales/lookup?activationId=${activation.id}&date=${today}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.meta.activationId).toBe(activation.id);
    expect(res.body.meta.dayCustomFields.map((f: any) => f.key)).toEqual(["weather"]);
    expect(res.body.data[0].customFields.map((f: any) => f.key)).toEqual(["damaged"]);
    expect(res.body.data[0].activationItemId).toBeTypeOf("string");
  });

  it("sales-field-values returns day values across a date range with names", async () => {
    const { token, campaign, activation } = await setup();
    const base = `/admin/v1/campaigns/${campaign.id}/sales-fields`;
    await request(app).post(base).set("Authorization", `Bearer ${token}`).send({ label: "Weather", type: "text", scope: "day" });
    await request(app).put(`/admin/v1/campaigns/${campaign.id}/sales/custom-values`).set("Authorization", `Bearer ${token}`)
      .send({ activationId: activation.id, date: today, day: { weather: "Rain" } });

    const res = await request(app).get(`/admin/v1/campaigns/${campaign.id}/sales-field-values?dateFrom=${today}&dateTo=${today}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ key: "weather", label: "Weather", value: "Rain" });
    expect(res.body.data[0].staffName).toBeTypeOf("string");
  });
});
