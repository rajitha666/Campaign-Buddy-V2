import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { prisma } from "../src/utils/prisma";
import { app, resetDb, adminToken, makeCampaignWithActivation } from "./helpers";

beforeEach(resetDb);

// Reads that must not see soft-deleted rows (#127). License/usage cases live in license.test.ts.
describe("soft-deleted rows are not reachable through reads (#127)", () => {
  it("granting campaign access cannot target a soft-deleted outlet", async () => {
    const { campaign, outlet } = await makeCampaignWithActivation();
    const user = await prisma.user.create({
      data: { username: "sd-sponsor", passwordHash: await bcrypt.hash("pw", 4), displayName: "SD", roleId: "sponsor" },
    });
    await prisma.outlet.update({ where: { id: outlet.id }, data: { deletedAt: new Date() } });

    const res = await request(app)
      .post(`/admin/v1/campaigns/${campaign.id}/admins/${user.id}/restore`)
      .set("Authorization", `Bearer ${await adminToken()}`)
      .send({ scopeType: "subset", outletIds: [outlet.id] });

    expect(res.status).toBe(400);
    expect(await prisma.campaignAccessGrant.count({ where: { userId: user.id } })).toBe(0);
  });
});
