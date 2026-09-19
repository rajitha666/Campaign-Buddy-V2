import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app, resetDb, adminToken, makeStaff, staffToken } from "./helpers";
import { prisma } from "../src/utils/prisma";

beforeEach(resetDb);

const URL = "/admin/v1/me/preferences";
const put = (token: string, body: unknown) =>
  request(app).put(URL).set("Authorization", `Bearer ${token}`).set("Content-Type", "application/json").send(JSON.stringify(body));

describe("me/preferences — hardening", () => {
  it("a mobile (field-staff) token cannot use the portal preferences API", async () => {
    const staff = await makeStaff();
    const token = await staffToken(staff.mobileUsername, "field-pw");
    expect([401, 403]).toContain((await request(app).get(URL).set("Authorization", `Bearer ${token}`)).status);
    expect([401, 403]).toContain((await put(token, { "menu.favorites": ["/clients"] })).status);
  });

  it("array bodies are 400s, never 500s", async () => {
    const token = await adminToken();
    for (const body of [[], [{ "menu.favorites": [] }]]) {
      const res = await put(token, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("caps favorites at 12 and rejects anything that is not a portal route path", async () => {
    const token = await adminToken();
    const many = Array.from({ length: 13 }, (_, i) => `/page-${i}`);
    expect((await put(token, { "menu.favorites": many })).status).toBe(400);
    for (const bad of ["https://evil.example", "javascript:alert(1)", "clients", "/a b", "/x?y=1", "/..%2f"]) {
      expect((await put(token, { "menu.favorites": [bad] })).status, bad).toBe(400);
    }
    expect((await put(token, { "menu.favorites": Array.from({ length: 12 }, (_, i) => `/page-${i}`) })).status).toBe(200);
  });

  it("a failed (invalid) update leaves the saved value untouched", async () => {
    const token = await adminToken();
    await put(token, { "menu.favorites": ["/clients"] });
    await put(token, { "menu.favorites": ["/ok"], "bogus.key": 1 });
    const got = await request(app).get(URL).set("Authorization", `Bearer ${token}`);
    expect(got.body.data["menu.favorites"]).toEqual(["/clients"]);
  });

  it("deleting a user removes their preferences instead of blocking the delete", async () => {
    const user = await prisma.user.create({
      data: { username: "temp", passwordHash: await bcrypt.hash("pw", 4), displayName: "Temp", roleId: "supervisor" },
    });
    await prisma.userPreference.create({ data: { userId: user.id, key: "menu.favorites", value: ["/clients"] } });
    await prisma.user.delete({ where: { id: user.id } });
    expect(await prisma.userPreference.count()).toBe(0);
  });
});
