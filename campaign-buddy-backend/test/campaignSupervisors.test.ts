import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/utils/prisma";
import { app, resetDb, adminToken, makeStaff, makeCampaignWithActivation } from "./helpers";

beforeEach(resetDb);

// GET /admin/v1/campaigns/:id/supervisors — supervisors "on" a campaign =
// union of (has a SupervisorRoute on it) OR (assigned to one of its
// activations via Activation.supervisorStaffId). Used by the portal's
// Assign Routes dropdown, which should only offer campaign supervisors.

async function makeSupervisor(name: string) {
  return makeStaff({ fullName: name, userType: "supervisor" });
}

async function makeRoute(campaignId: string, supervisorStaffId: string) {
  return prisma.supervisorRoute.create({
    data: { campaignId, supervisorStaffId, outletIds: [], dateFrom: new Date(), dateTo: new Date() },
  });
}

describe("GET /admin/v1/campaigns/:id/supervisors", () => {
  it("returns union of route + activation supervisors for the campaign only", async () => {
    const { campaign, activation } = await makeCampaignWithActivation();

    const viaRoute = await makeSupervisor("Route Sup");
    await makeRoute(campaign.id, viaRoute.id);

    const viaActivation = await makeSupervisor("Activation Sup");
    await prisma.activation.update({ where: { id: activation.id }, data: { supervisorStaffId: viaActivation.id } });

    // On a different campaign — must NOT appear
    const { campaign: otherCampaign } = await makeCampaignWithActivation();
    const outsider = await makeSupervisor("Outsider Sup");
    await makeRoute(otherCampaign.id, outsider.id);

    const res = await request(app)
      .get(`/admin/v1/campaigns/${campaign.id}/supervisors`)
      .set("Authorization", `Bearer ${await adminToken()}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.map((r: any) => r.id);
    expect(ids).toContain(viaRoute.id);
    expect(ids).toContain(viaActivation.id);
    expect(ids).not.toContain(outsider.id);
    expect(res.body.data.every((r: any) => r.userType === "supervisor")).toBe(true);
  });

  it("excludes inactive supervisors and deleted routes", async () => {
    const { campaign } = await makeCampaignWithActivation();
    const inactive = await makeSupervisor("Gone Sup");
    await prisma.staff.update({ where: { id: inactive.id }, data: { status: "inactive" } });
    await makeRoute(campaign.id, inactive.id);

    const { campaign: campaign2 } = await makeCampaignWithActivation();
    const gone = await makeSupervisor("Deleted Route Sup");
    const route = await makeRoute(campaign2.id, gone.id);
    await prisma.supervisorRoute.update({ where: { id: route.id }, data: { deletedAt: new Date() } });

    for (const c of [campaign, campaign2]) {
      const res = await request(app)
        .get(`/admin/v1/campaigns/${c.id}/supervisors`)
        .set("Authorization", `Bearer ${await adminToken()}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    }
  });

  it("returns [] for a campaign with no supervisors (no global fallback)", async () => {
    const { campaign } = await makeCampaignWithActivation();
    const res = await request(app)
      .get(`/admin/v1/campaigns/${campaign.id}/supervisors`)
      .set("Authorization", `Bearer ${await adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});
