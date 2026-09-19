import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, resetDb } from "./helpers";

beforeEach(resetDb);

// A client that sends a broken or oversized body made a mistake — it must get a
// 4xx it can act on, not a 500 that pages whoever watches the error logs.
describe("body-parser failures are client errors, not 500s", () => {
  it("malformed JSON on the admin login → 400", async () => {
    const res = await request(app)
      .post("/admin/v1/auth/login")
      .set("Content-Type", "application/json")
      .send("{bad json");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("malformed JSON on a mobile route → 400", async () => {
    const res = await request(app)
      .post("/v1/auth/login")
      .set("Content-Type", "application/json")
      .send('{"username": ');
    expect(res.status).toBe(400);
  });

  it("a body over the size limit → 413", async () => {
    const res = await request(app)
      .post("/admin/v1/auth/login")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ username: "a".repeat(200_000), password: "x" }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });
});
