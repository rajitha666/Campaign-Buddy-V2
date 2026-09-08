import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, resetDb, makeStaff } from "./helpers";

beforeEach(resetDb);

describe("auth", () => {
  it("admin login returns a token + user, never a passwordHash", async () => {
    const res = await request(app).post("/admin/v1/auth/login").send({ username: "admin", password: "admin-pw" });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTypeOf("string");
    expect(res.body.data.user.roleId).toBe("adm");
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  it("admin login rejects a bad password with 401", async () => {
    const res = await request(app).post("/admin/v1/auth/login").send({ username: "admin", password: "nope" });
    expect(res.status).toBe(401);
  });

  it("admin login 400s on a missing field (zod validation)", async () => {
    const res = await request(app).post("/admin/v1/auth/login").send({ username: "admin" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("mobile login returns access + refresh tokens", async () => {
    await makeStaff({ mobileUsername: "field1" });
    const res = await request(app).post("/v1/auth/login").send({ username: "field1", password: "field-pw" });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTypeOf("string");
    expect(res.body.data.refreshToken).toBeTypeOf("string");
  });

  it("mobile login rejects an inactive staff member", async () => {
    await makeStaff({ mobileUsername: "field2", status: "inactive" });
    const res = await request(app).post("/v1/auth/login").send({ username: "field2", password: "field-pw" });
    expect(res.status).toBe(401);
  });

  it("GET /v1/me returns the API-spec User shape", async () => {
    await makeStaff({ mobileUsername: "field3", fullName: "Jane Roe", displayName: "Janey", userType: "supervisor" });
    const login = await request(app).post("/v1/auth/login").send({ username: "field3", password: "field-pw" });
    const me = await request(app).get("/v1/me").set("Authorization", `Bearer ${login.body.data.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data).toMatchObject({ username: "field3", fullName: "Jane Roe", displayName: "Janey", role: "campaign_owner" });
    expect(me.body.data.avatarInitials).toBeTypeOf("string");
    expect(me.body.data).not.toHaveProperty("passwordHash");
    expect(me.body.data).not.toHaveProperty("mobileUsername");
  });

  it("rejects a mobile token on an admin route (separate JWT spaces)", async () => {
    await makeStaff({ mobileUsername: "field4" });
    const login = await request(app).post("/v1/auth/login").send({ username: "field4", password: "field-pw" });
    const res = await request(app).get("/admin/v1/campaigns").set("Authorization", `Bearer ${login.body.data.accessToken}`);
    expect(res.status).toBe(401);
  });
});
