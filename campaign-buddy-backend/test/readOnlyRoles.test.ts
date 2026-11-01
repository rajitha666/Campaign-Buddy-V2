import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import adminRouter from "../src/modules/admin";
import { prisma } from "../src/utils/prisma";
import { app, resetDb, makeCampaignWithActivation } from "./helpers";

// Marketing claims read-only roles cannot change data. Walk the real admin router and prove it for
// EVERY write route, not one sample (#146).

function collect(router: any, prefix = ""): Array<{ method: string; path: string }> {
  const out: Array<{ method: string; path: string }> = [];
  for (const layer of router.stack ?? []) {
    if (layer.route) for (const m of Object.keys(layer.route.methods)) out.push({ method: m.toUpperCase(), path: prefix + layer.route.path });
    else if (layer.handle?.stack) out.push(...collect(layer.handle, prefix));
  }
  return out;
}

const WRITES = collect(adminRouter).filter((r) => r.method !== "GET" && r.method !== "HEAD" && r.method !== "OPTIONS");

// Write routes a read-only role may legitimately call (their own session / preferences), each with the reason.
const OPEN_TO_ALL_ROLES: Record<string, string> = {
  "PUT /me/preferences": "a person saves their own display preferences (favourites, last campaign); no campaign data changes",
};

beforeEach(resetDb);

async function tokenFor(roleId: "sponsor" | "supervisor", campaignId: string, outletId: string) {
  const username = `ro-${roleId}`;
  const user = await prisma.user.create({
    data: { username, passwordHash: await bcrypt.hash("pw", 4), displayName: username, roleId },
  });
  await prisma.campaignAccessGrant.create({ data: { userId: user.id, campaignId, scopeType: "all" } });
  const res = await request(app).post("/admin/v1/auth/login").send({ username, password: "pw" });
  return res.body.data.accessToken as string;
}

describe("read-only roles are rejected on every admin write route (#146)", () => {
  it("finds the write routes", () => {
    expect(WRITES.length).toBeGreaterThan(60);
  });

  it("every write route answers 403 to a sponsor and to a supervisor who can open the campaign", async () => {
    const { campaign, outlet } = await makeCampaignWithActivation();
    const notRejected: string[] = [];
    for (const role of ["sponsor", "supervisor"] as const) {
      const token = await tokenFor(role, campaign.id, outlet.id);
      for (const r of WRITES) {
        if (r.path.startsWith("/auth") || `${r.method} ${r.path}` in OPEN_TO_ALL_ROLES) continue;
        const path = r.path.replace(":campaignId", campaign.id).replace(/:[A-Za-z]+/g, "00000000-0000-0000-0000-000000000000");
        const res = await (request(app) as any)[r.method.toLowerCase()](`/admin/v1${path}`).set("Authorization", `Bearer ${token}`).send({});
        if (res.status !== 403) notRejected.push(`${role} ${r.method} ${r.path} -> ${res.status}`);
      }
    }
    expect(notRejected, "write routes a read-only role can reach; fix the guard or list it in OPEN_TO_ALL_ROLES with a reason").toEqual([]);
  });

  it("control: the same kind of request is NOT a 403 for an admin, so the 403s above come from the role guard", async () => {
    const { campaign } = await makeCampaignWithActivation();
    const login = await request(app).post("/admin/v1/auth/login").send({ username: "admin", password: "admin-pw" });
    const res = await request(app)
      .post(`/admin/v1/campaigns/${campaign.id}/activations`)
      .set("Authorization", `Bearer ${login.body.data.accessToken}`)
      .send({});
    expect(res.status).toBe(400); // validation, not authorisation
  });
});
