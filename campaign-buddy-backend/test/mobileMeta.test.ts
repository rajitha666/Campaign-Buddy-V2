import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "./helpers";
import backendPkg from "../package.json";
import { API_CONTRACT_REVISION } from "../src/utils/meta";

// GET /v1/meta — the app↔API handshake. See docs/multi-tenant-release-strategy.md
// § 3.2: one store binary talks to many tenant servers on different releases, so
// the app negotiates on `features[]` and never on `server.version`.
describe("GET /v1/meta", () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  it("is public and reports the contract, version floor and feature list", async () => {
    process.env.TENANT_SLUG = "acme";
    process.env.TENANT_NAME = "Acme Field Marketing";
    process.env.APP_MIN_SUPPORTED_VERSION = "1.0.10";

    const res = await request(app).get("/v1/meta");

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      tenant: { slug: "acme", displayName: "Acme Field Marketing" },
      api: { major: 1, contract: API_CONTRACT_REVISION },
      server: { version: backendPkg.version },
      app: { minSupported: "1.0.10" },
    });
    // Capability negotiation is the whole point — the app branches on these.
    expect(res.body.data.features).toContain("sales.customFields");
    expect(res.body.data.limits.photoMaxBytes).toBe(5 * 1024 * 1024);
  });

  it("drops features the tenant has disabled, so one app build degrades gracefully", async () => {
    process.env.FEATURES_DISABLED = "sales.customFields, supervisor.routes";

    const res = await request(app).get("/v1/meta");

    expect(res.status).toBe(200);
    expect(res.body.data.features).not.toContain("sales.customFields");
    expect(res.body.data.features).not.toContain("supervisor.routes");
    expect(res.body.data.features).toContain("issues.reporting");
  });
});
