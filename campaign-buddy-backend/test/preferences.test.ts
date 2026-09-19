import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app, resetDb, adminToken } from "./helpers";
import { prisma } from "../src/utils/prisma";

beforeEach(resetDb);

const URL = "/admin/v1/me/preferences";

async function tokenFor(username: string, roleId = "supervisor") {
  await prisma.user.upsert({
    where: { username },
    update: {},
    create: { username, passwordHash: await bcrypt.hash("pw", 4), displayName: username, roleId },
  });
  const res = await request(app).post("/admin/v1/auth/login").send({ username, password: "pw" });
  return res.body.data.accessToken as string;
}

const get = (token: string) => request(app).get(URL).set("Authorization", `Bearer ${token}`);
const put = (token: string, body: unknown) =>
  request(app).put(URL).set("Authorization", `Bearer ${token}`).send(body as object);

describe("GET/PUT /admin/v1/me/preferences", () => {
  it("requires a portal login", async () => {
    expect((await request(app).get(URL)).status).toBe(401);
    expect((await request(app).put(URL).send({})).status).toBe(401);
  });

  it("returns an empty object until something is saved", async () => {
    const res = await get(await adminToken());
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({});
  });

  it("saves favorites and returns them on a fresh login (another device)", async () => {
    const first = await tokenFor("sup1");
    const saved = await put(first, { "menu.favorites": ["/sales/sku-wise", "/tracking/live"] });
    expect(saved.status).toBe(200);
    expect(saved.body.data["menu.favorites"]).toEqual(["/sales/sku-wise", "/tracking/live"]);

    const secondDevice = await tokenFor("sup1"); // new login → new token
    const res = await get(secondDevice);
    expect(res.body.data).toEqual({ "menu.favorites": ["/sales/sku-wise", "/tracking/live"] });
  });

  it("keeps each user's preferences separate", async () => {
    await put(await tokenFor("a"), { "menu.favorites": ["/dashboard"] });
    const other = await get(await tokenFor("b"));
    expect(other.body.data).toEqual({});
  });

  it("replaces the previous value, drops duplicates and keeps order", async () => {
    const t = await tokenFor("sup1");
    await put(t, { "menu.favorites": ["/a", "/b"] });
    const res = await put(t, { "menu.favorites": ["/c", "/a", "/c"] });
    expect(res.body.data["menu.favorites"]).toEqual(["/c", "/a"]);
  });

  it("resets a key when it is set to null", async () => {
    const t = await tokenFor("sup1");
    await put(t, { "menu.favorites": ["/a"] });
    const res = await put(t, { "menu.favorites": null });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({});
    expect((await get(t)).body.data).toEqual({});
  });

  it("leaves other keys alone when the body omits them", async () => {
    const t = await tokenFor("sup1");
    await put(t, { "menu.favorites": ["/a"] });
    expect((await put(t, {})).body.data).toEqual({ "menu.favorites": ["/a"] });
  });

  it("rejects unknown preference keys", async () => {
    const res = await put(await tokenFor("sup1"), { "nope.key": 1 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects malformed favorites", async () => {
    const t = await tokenFor("sup1");
    for (const bad of ["/a", [1], ["no-leading-slash"], ["/ok", "http://evil.example/x"], Array.from({ length: 13 }, (_, i) => `/p${i}`)]) {
      const res = await put(t, { "menu.favorites": bad });
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
  });
});
