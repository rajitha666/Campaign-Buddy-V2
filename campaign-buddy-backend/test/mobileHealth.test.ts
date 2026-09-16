import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "./helpers";

describe("GET /v1/health", () => {
  it("is public — no Authorization header required", async () => {
    const res = await request(app).get("/v1/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", service: "campaign-buddy-backend" });
  });
});
