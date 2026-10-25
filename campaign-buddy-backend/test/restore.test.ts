import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/utils/prisma";
import { app, resetDb, adminToken } from "./helpers";

beforeEach(resetDb);

const A = "/admin/v1";
async function auth() {
  return { Authorization: `Bearer ${await adminToken()}` };
}

async function catalog() {
  const client = await prisma.client.create({ data: { companyName: "Co", clientName: "C" } });
  const brand = await prisma.brand.create({ data: { name: "B", clientId: client.id } });
  const item = await prisma.item.create({ data: { brandId: brand.id, sku: "SKU-1", name: "I", unitPrice: 1 } });
  const city = await prisma.city.create({ data: { name: "City", province: "P", district: "D" } });
  const outlet = await prisma.outlet.create({
    data: { outletNo: "O-1", name: "Out", cityId: city.id, latitude: 6.9, longitude: 79.9 },
  });
  const dp = await prisma.distributorPoint.create({ data: { name: "DP", cityId: city.id, clientId: client.id } });
  return { client, brand, item, city, outlet, dp };
}

describe("catalog restore (#110)", () => {
  it.each([
    ["clients", "client"],
    ["brands", "brand"],
    ["items", "item"],
    ["cities", "city"],
    ["outlets", "outlet"],
    ["distributor-points", "dp"],
  ] as const)("%s: delete -> restore brings the row back; double restore is 404", async (path, key) => {
    const c: any = await catalog();
    const h = await auth();
    expect((await request(app).delete(`${A}/${path}/${c[key].id}`).set(h)).status).toBe(200);
    const list = await request(app).get(`${A}/${path}`).set(h);
    expect(JSON.stringify(list.body.data)).not.toContain(c[key].id);

    const res = await request(app).post(`${A}/${path}/${c[key].id}/restore`).set(h);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: c[key].id, deletedAt: null, softDeleted: false });
    expect(JSON.stringify((await request(app).get(`${A}/${path}`).set(h)).body.data)).toContain(c[key].id);
    expect((await request(app).post(`${A}/${path}/${c[key].id}/restore`).set(h)).status).toBe(404);
  });

  it("unknown id is 404", async () => {
    expect((await request(app).post(`${A}/clients/nope/restore`).set(await auth())).status).toBe(404);
  });

  it.each([
    ["brands", "brand", "client"],
    ["items", "item", "brand"],
    ["outlets", "outlet", "city"],
    ["distributor-points", "dp", "city"],
  ] as const)("%s: restore under a deleted parent is 409 PARENT_DELETED", async (path, key, parent) => {
    const c: any = await catalog();
    const model = { client: prisma.client, brand: prisma.brand, city: prisma.city }[parent] as any;
    await (prisma as any)[{ brands: "brand", items: "item", outlets: "outlet", "distributor-points": "distributorPoint" }[path]!].update({
      where: { id: c[key].id }, data: { deletedAt: new Date() },
    });
    await model.update({ where: { id: c[parent].id }, data: { deletedAt: new Date() } });
    const res = await request(app).post(`${A}/${path}/${c[key].id}/restore`).set(await auth());
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("PARENT_DELETED");
  });

  it("restoring an item/outlet whose code was re-used meanwhile is 409 CODE_IN_USE", async () => {
    const c = await catalog();
    const h = await auth();
    await request(app).delete(`${A}/items/${c.item.id}`).set(h);
    await prisma.item.create({ data: { brandId: c.brand.id, sku: "SKU-1", name: "new", unitPrice: 1 } });
    const r1 = await request(app).post(`${A}/items/${c.item.id}/restore`).set(h);
    expect(r1.status).toBe(409);
    expect(r1.body.error.code).toBe("CODE_IN_USE");

    await request(app).delete(`${A}/outlets/${c.outlet.id}`).set(h);
    await prisma.outlet.create({ data: { outletNo: "O-1", name: "new", cityId: c.city.id, latitude: 6.9, longitude: 79.9 } });
    const r2 = await request(app).post(`${A}/outlets/${c.outlet.id}/restore`).set(h);
    expect(r2.status).toBe(409);
    expect(r2.body.error.code).toBe("CODE_IN_USE");
  });
});
