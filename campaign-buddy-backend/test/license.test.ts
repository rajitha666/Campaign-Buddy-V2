import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app, resetDb, adminToken, makeCampaignWithActivation, makeStaff } from "./helpers";
import { prisma } from "../src/utils/prisma";
import { computeLicenseUsage } from "../src/utils/licenseUsage";
import { captureLicenseSnapshots } from "../src/jobs/licenseSnapshot";

beforeEach(resetDb);

async function portalUser(username: string, roleId: string) {
  return prisma.user.create({
    data: { username, passwordHash: await bcrypt.hash("pw", 4), displayName: username, roleId },
  });
}
async function grant(userId: string, campaignId: string) {
  return prisma.campaignAccessGrant.create({ data: { userId, campaignId, scopeType: "all" } });
}

describe("license usage — seat counting", () => {
  it("counts a promoter once even across multiple activations", async () => {
    const { campaign, outlet, staff } = await makeCampaignWithActivation();
    const city = await prisma.city.create({ data: { name: "C2", province: "P", district: "D" } });
    const outlet2 = await prisma.outlet.create({
      data: { outletNo: "O-2", name: "O2", cityId: city.id, latitude: 6.8, longitude: 79.8 },
    });
    await prisma.activation.create({
      data: { name: "A2", campaignId: campaign.id, outletId: outlet2.id, staffId: staff.id, dateFrom: campaign.startDate, dateTo: campaign.endDate },
    });

    const usage = await computeLicenseUsage(campaign.id);
    expect(usage.promoter).toBe(1);
    expect(usage.admin).toBe(1); // the auto-grant for `admin` on campaign create
  });

  it("counts a supervisor who is both a Staff and a linked portal user only once", async () => {
    const { campaign, outlet, staff: promoter } = await makeCampaignWithActivation();
    const supUser = await portalUser("sup_linked", "supervisor");
    const supStaff = await makeStaff({ userType: "supervisor", linkedUserId: supUser.id });
    await grant(supUser.id, campaign.id);
    await prisma.activation.update({ where: { id: (await prisma.activation.findFirstOrThrow({ where: { campaignId: campaign.id } })).id }, data: { supervisorStaffId: supStaff.id } });

    // plus a second, portal-only supervisor
    const supUser2 = await portalUser("sup_portal", "supervisor");
    await grant(supUser2.id, campaign.id);

    const usage = await computeLicenseUsage(campaign.id);
    expect(usage.supervisor).toBe(2); // linked person (1) + portal-only supervisor (1)
    expect(usage.promoter).toBe(1);
    void promoter;
  });

  it("admin group spans roles adm and usr; sponsor is separate", async () => {
    const { campaign } = await makeCampaignWithActivation();
    const usr = await portalUser("campaign_admin", "usr");
    await grant(usr.id, campaign.id);
    const sponsor = await portalUser("sponsor_a", "sponsor");
    await grant(sponsor.id, campaign.id);

    const usage = await computeLicenseUsage(campaign.id);
    expect(usage.admin).toBe(2); // seeded `admin` (adm) + `campaign_admin` (usr)
    expect(usage.sponsor).toBe(1);
  });
});

describe("license usage — API", () => {
  it("GET /license reports over-limit state without blocking assignment", async () => {
    const token = await adminToken();
    const { campaign } = await makeCampaignWithActivation();
    // squeeze the promoter cap below current usage
    await prisma.campaign.update({ where: { id: campaign.id }, data: { licensePromoterCap: 0 } });

    const res = await request(app).get(`/admin/v1/campaigns/${campaign.id}/license`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const promoter = res.body.data.groups.find((g: any) => g.group === "promoter");
    expect(promoter).toMatchObject({ used: 1, cap: 0, state: "over" });
    expect(res.body.data.overallState).toBe("over");

    // assigning another promoter still succeeds (soft limit)
    const city = await prisma.city.create({ data: { name: "C3", province: "P", district: "D" } });
    const outlet = await prisma.outlet.create({ data: { outletNo: "O-3", name: "O3", cityId: city.id, latitude: 6.7, longitude: 79.7 } });
    const promoter2 = await makeStaff();
    const add = await request(app)
      .post(`/admin/v1/campaigns/${campaign.id}/activations`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "A3", outletId: outlet.id, staffId: promoter2.id, dateFrom: "2026-09-01", dateTo: "2026-10-01" });
    expect(add.status).toBe(201);
  });

  it("PATCH /license is adm-only", async () => {
    const { campaign, outlet, staff: promoter } = await makeCampaignWithActivation();
    const admTok = await adminToken();

    const okRes = await request(app)
      .patch(`/admin/v1/campaigns/${campaign.id}/license`)
      .set("Authorization", `Bearer ${admTok}`)
      .send({ promoterCap: 30, warnThresholdPct: 90 });
    expect(okRes.status).toBe(200);
    expect(okRes.body.data.groups.find((g: any) => g.group === "promoter").cap).toBe(30);
    expect(okRes.body.data.warnThresholdPct).toBe(90);

    // a usr (Campaign Admin) may read but not write
    const usr = await portalUser("usr1", "usr");
    await grant(usr.id, campaign.id);
    const usrLogin = await request(app).post("/admin/v1/auth/login").send({ username: "usr1", password: "pw" });
    const usrTok = usrLogin.body.data.accessToken;

    const read = await request(app).get(`/admin/v1/campaigns/${campaign.id}/license`).set("Authorization", `Bearer ${usrTok}`);
    expect(read.status).toBe(200);
    const write = await request(app)
      .patch(`/admin/v1/campaigns/${campaign.id}/license`)
      .set("Authorization", `Bearer ${usrTok}`)
      .send({ promoterCap: 5 });
    expect(write.status).toBe(403);
    void outlet; void promoter;
  });

  it("a supervisor token is 403'd on the license routes", async () => {
    const { campaign, outlet } = await makeCampaignWithActivation();
    const supUser = await portalUser("sup_ro", "supervisor");
    await prisma.campaignAccessGrant.create({ data: { userId: supUser.id, campaignId: campaign.id, scopeType: "subset", outletIds: [outlet.id] } });
    const login = await request(app).post("/admin/v1/auth/login").send({ username: "sup_ro", password: "pw" });
    const tok = login.body.data.accessToken;

    expect((await request(app).get(`/admin/v1/campaigns/${campaign.id}/license`).set("Authorization", `Bearer ${tok}`)).status).toBe(403);
    expect((await request(app).get(`/admin/v1/license/usage`).set("Authorization", `Bearer ${tok}`)).status).toBe(403);
  });

  it("GET /license/usage rolls up campaigns and filters by state", async () => {
    const token = await adminToken();
    const a = await makeCampaignWithActivation();
    const b = await makeCampaignWithActivation();
    await prisma.campaign.update({ where: { id: a.campaign.id }, data: { licensePromoterCap: 0 } }); // -> over

    const all = await request(app).get(`/admin/v1/license/usage`).set("Authorization", `Bearer ${token}`);
    expect(all.status).toBe(200);
    expect(all.body.data.length).toBe(2);

    const over = await request(app).get(`/admin/v1/license/usage?state=over`).set("Authorization", `Bearer ${token}`);
    expect(over.body.data.map((r: any) => r.campaignId)).toEqual([a.campaign.id]);
    void b;
  });
});

describe("license usage — snapshot job", () => {
  it("keeps the peak value seen within a period", async () => {
    const { campaign } = await makeCampaignWithActivation();

    await captureLicenseSnapshots();
    let week = await prisma.campaignLicenseUsageSnapshot.findFirstOrThrow({ where: { campaignId: campaign.id, period: "week" } });
    expect(week.promoterUsed).toBe(1);

    // add a second promoter, re-capture -> peak rises
    const city = await prisma.city.create({ data: { name: "C4", province: "P", district: "D" } });
    const outlet = await prisma.outlet.create({ data: { outletNo: "O-4", name: "O4", cityId: city.id, latitude: 6.6, longitude: 79.6 } });
    const p2 = await makeStaff();
    await prisma.activation.create({ data: { name: "A4", campaignId: campaign.id, outletId: outlet.id, staffId: p2.id, dateFrom: campaign.startDate, dateTo: campaign.endDate } });
    await captureLicenseSnapshots();
    week = await prisma.campaignLicenseUsageSnapshot.findFirstOrThrow({ where: { campaignId: campaign.id, period: "week" } });
    expect(week.promoterUsed).toBe(2);

    // remove both extra + original? drop to fewer, re-capture -> peak stays
    await prisma.activation.deleteMany({ where: { campaignId: campaign.id } });
    await captureLicenseSnapshots();
    week = await prisma.campaignLicenseUsageSnapshot.findFirstOrThrow({ where: { campaignId: campaign.id, period: "week" } });
    expect(week.promoterUsed).toBe(2);
  });
});
