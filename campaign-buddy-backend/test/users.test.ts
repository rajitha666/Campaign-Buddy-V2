import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, resetDb, adminToken } from "./helpers";

beforeEach(resetDb);

async function createUser() {
  const token = await adminToken();
  const res = await request(app)
    .post("/admin/v1/users")
    .set("Authorization", `Bearer ${token}`)
    .send({ username: "u1", password: "original-pw", displayName: "User One", roleId: "usr" });
  return { token, user: res.body.data, status: res.status };
}

describe("PATCH /admin/v1/users — blank password keeps the existing hash", () => {
  it("200s when password is submitted as an empty string, and the original password still works", async () => {
    const { token, user } = await createUser();
    expect(token).toBeTruthy();

    const patched = await request(app)
      .patch(`/admin/v1/users/${user.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ displayName: "User One Renamed", password: "" });
    expect(patched.status).toBe(200);
    expect(patched.body.data.displayName).toBe("User One Renamed");

    const login = await request(app)
      .post("/admin/v1/auth/login")
      .send({ username: "u1", password: "original-pw" });
    expect(login.status).toBe(200);
  });

  it("a non-empty password changes the hash", async () => {
    const { token, user } = await createUser();

    const patched = await request(app)
      .patch(`/admin/v1/users/${user.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ password: "brand-new-pw" });
    expect(patched.status).toBe(200);

    const oldLogin = await request(app).post("/admin/v1/auth/login").send({ username: "u1", password: "original-pw" });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(app).post("/admin/v1/auth/login").send({ username: "u1", password: "brand-new-pw" });
    expect(newLogin.status).toBe(200);
  });
});
