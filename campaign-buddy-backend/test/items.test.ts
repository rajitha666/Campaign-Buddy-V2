import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { prisma } from "../src/utils/prisma";
import { app, resetDb, adminToken, makeCampaignWithActivation } from "./helpers";

beforeEach(resetDb);

async function usrToken(username: string) {
  await prisma.user.create({
    data: { username, passwordHash: await bcrypt.hash("pw", 4), displayName: username, roleId: "usr" },
  });
  const res = await request(app).post("/admin/v1/auth/login").send({ username, password: "pw" });
  return res.body.data.accessToken as string;
}

async function makeItem() {
  const brand = await prisma.brand.create({
    data: { name: "B", clientId: (await prisma.client.create({ data: { companyName: "Co", clientName: "C" } })).id },
  });
  return prisma.item.create({ data: { brandId: brand.id, sku: "SKU-1", name: "Item", unitPrice: 100 } });
}

describe("DELETE /admin/v1/items/:id — usr role + soft delete", () => {
  it("lets a Campaign Admin (usr) delete an item", async () => {
    const token = await usrToken("usr_deleter");
    const item = await makeItem();

    const res = await request(app).delete(`/admin/v1/items/${item.id}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.softDeleted).toBe(true);
  });

  it("soft-deletes: keeps the row in the DB but marks it with deletedAt", async () => {
    const token = await adminToken();
    const item = await makeItem();

    const res = await request(app).delete(`/admin/v1/items/${item.id}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);

    const stillThere = await prisma.item.findUnique({ where: { id: item.id } });
    expect(stillThere).not.toBeNull();
    expect(stillThere?.deletedAt).not.toBeNull();
  });

  it("excludes soft-deleted items from GET /admin/v1/items", async () => {
    const token = await adminToken();
    const { item } = await makeCampaignWithActivation(); // campaigns/relations stay intact
    await makeItem(); // survivor
    await request(app).delete(`/admin/v1/items/${item.id}`).set("Authorization", `Bearer ${token}`);

    const res = await request(app).get("/admin/v1/items").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((r: any) => r.id === item.id)).toBe(false);
    expect(res.body.data).toHaveLength(1);
  });

  it("404s on an unknown item id", async () => {
    const token = await adminToken();
    const res = await request(app).delete("/admin/v1/items/does-not-exist").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it("still rejects a supervisor persona with 403", async () => {
    await prisma.user.create({
      data: { username: "sup1", passwordHash: await bcrypt.hash("pw", 4), displayName: "Sup", roleId: "supervisor" },
    });
    const res = await request(app).post("/admin/v1/auth/login").send({ username: "sup1", password: "pw" });
    const token = res.body.data.accessToken;

    const del = await request(app).delete("/admin/v1/items/whatever").set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(403);
  });
});
