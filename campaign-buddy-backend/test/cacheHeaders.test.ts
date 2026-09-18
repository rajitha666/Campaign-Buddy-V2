import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, resetDb, staffToken, adminToken, makeStaff } from "./helpers";

beforeEach(resetDb);

// Express's default ETag support lets browsers cache authenticated GET
// responses by URL alone — Authorization isn't part of the cache key unless
// the server sends `Vary: Authorization`, which nothing here does. In
// practice this meant one staff member's /v1/me/assignments/today response
// could be served back (from the browser's HTTP cache) to a *different*
// staff member who logs into the same origin afterwards, e.g. a promoter
// checking in against another promoter's cached assignment id and getting a
// confusing "No assignment for today" 404. Every authenticated response must
// tell the browser never to cache it.
describe("authenticated responses disable browser caching", () => {
  it("sends Cache-Control: no-store on /v1 responses", async () => {
    const staff = await makeStaff();
    const token = await staffToken(staff.mobileUsername, "field-pw");
    const res = await request(app).get("/v1/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toContain("no-store");
  });

  it("sends Cache-Control: no-store on /admin/v1 responses", async () => {
    const token = await adminToken();
    const res = await request(app).get("/admin/v1/cities").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toContain("no-store");
  });
});
