import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { prisma } from "../src/utils/prisma";
import { app, resetDb, adminToken, staffToken, makeStaff, makeCampaignWithActivation } from "./helpers";

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

// A removed activation must behave as if it is gone for everyone who looks at today's work.
describe("soft-deleted activations are invisible to operations reads (#127)", () => {
  const today = () => new Date().toISOString().slice(0, 10);
  const auth = async () => ({ Authorization: `Bearer ${await adminToken()}` });

  async function withDeletedActivation() {
    const fx = await makeCampaignWithActivation();
    await prisma.activation.update({ where: { id: fx.activation.id }, data: { deletedAt: new Date() } });
    return fx;
  }

  it("Update Sales lookup cannot open a deleted activation, by id or by outlet and day", async () => {
    const { campaign, activation, outlet } = await withDeletedActivation();
    const byId = await request(app)
      .get(`/admin/v1/campaigns/${campaign.id}/sales/lookup`)
      .query({ activationId: activation.id, date: today() })
      .set(await auth());
    expect(byId.status).toBe(404);
    const byOutlet = await request(app)
      .get(`/admin/v1/campaigns/${campaign.id}/sales/lookup`)
      .query({ outletId: outlet.id, date: today() })
      .set(await auth());
    expect(byOutlet.status).toBe(404);
  });

  it("today's foot-fall entry does not land on a deleted activation", async () => {
    const { campaign } = await withDeletedActivation();
    const res = await request(app)
      .patch(`/admin/v1/campaigns/${campaign.id}/stats/today`)
      .set(await auth())
      .send({ footFall: 10, approached: 5, converted: 2 });
    expect(res.status).toBe(404);
  });

  it("staff on a deleted activation are not reported absent", async () => {
    const { campaign, staff } = await withDeletedActivation();
    const res = await request(app)
      .get(`/admin/v1/campaigns/${campaign.id}/absence`)
      .query({ date: today() })
      .set(await auth());
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(staff.id);
  });

  it("leave requests list only staff on live activations", async () => {
    const { campaign, staff } = await withDeletedActivation();
    await prisma.leaveRequest.create({
      data: { staffId: staff.id, fromDate: new Date(), toDate: new Date(), reason: "personal" as any },
    });
    const res = await request(app).get(`/admin/v1/campaigns/${campaign.id}/leave-requests`).set(await auth());
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it("custom sales values cannot be saved against a deleted activation", async () => {
    const { campaign, activation } = await withDeletedActivation();
    const res = await request(app)
      .put(`/admin/v1/campaigns/${campaign.id}/sales/custom-values`)
      .set(await auth())
      .send({ activationId: activation.id, date: today(), day: {} });
    expect(res.status).toBe(404);
  });
});

describe("soft-deleted supervisor routes are not shown in the mobile app (#127)", () => {
  it("GET /v1/me/supervisor-routes skips a deleted route", async () => {
    const { campaign } = await makeCampaignWithActivation();
    const sup = await makeStaff({ userType: "supervisor" });
    const day = new Date();
    const route = await prisma.supervisorRoute.create({
      data: { campaignId: campaign.id, supervisorStaffId: sup.id, outletIds: [], dateFrom: day, dateTo: day, deletedAt: new Date() },
    });
    const token = await staffToken(sup.mobileUsername!, "field-pw");
    const res = await request(app).get("/v1/me/supervisor-routes").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(route.id);
  });
});
