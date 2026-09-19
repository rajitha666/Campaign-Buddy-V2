import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, resetDb, adminToken, makeCampaignWithActivation, makeStaff } from "./helpers";
import { prisma } from "../src/utils/prisma";

beforeEach(resetDb);

describe("supervisor auto-grant on activation assignment (§5.3)", () => {
  it("creates a subset grant, expands it for a 2nd outlet, and no-ops on a dup", async () => {
    const token = await adminToken();
    const { campaign, outlet } = await makeCampaignWithActivation();

    // supervisor with a linked portal user
    const supUser = await prisma.user.create({
      data: { username: "sup1", passwordHash: "x", displayName: "Sup", roleId: "supervisor" },
    });
    const sup = await makeStaff({ userType: "supervisor", linkedUserId: supUser.id });
    const promoter = await makeStaff();
    const city = await prisma.city.create({ data: { name: "C2", province: "P", district: "D" } });
    const outlet2 = await prisma.outlet.create({
      data: { outletNo: "O2", name: "O2", cityId: city.id, latitude: 6.8, longitude: 79.8 },
    });
    const body = (outletId: string) => ({
      name: "A",
      outletId,
      staffId: promoter.id,
      supervisorStaffId: sup.id,
      dateFrom: "2026-09-01",
      dateTo: "2026-10-01",
    });

    await request(app).post(`/admin/v1/campaigns/${campaign.id}/activations`).set("Authorization", `Bearer ${token}`).send(body(outlet.id));
    let grants = await prisma.campaignAccessGrant.findMany({ where: { userId: supUser.id } });
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({ scopeType: "subset", outletIds: [outlet.id] });

    await request(app).post(`/admin/v1/campaigns/${campaign.id}/activations`).set("Authorization", `Bearer ${token}`).send(body(outlet2.id));
    grants = await prisma.campaignAccessGrant.findMany({ where: { userId: supUser.id } });
    expect(grants).toHaveLength(1);
    expect(grants[0].outletIds.sort()).toEqual([outlet.id, outlet2.id].sort());

    await request(app).post(`/admin/v1/campaigns/${campaign.id}/activations`).set("Authorization", `Bearer ${token}`).send(body(outlet2.id));
    grants = await prisma.campaignAccessGrant.findMany({ where: { userId: supUser.id } });
    expect(grants[0].outletIds).toHaveLength(2);
  });
});

describe("link any back-office role to a campaign via /campaigns/:id/admins", () => {
  it("links an existing sponsor account and lists it", async () => {
    const token = await adminToken();
    const { campaign } = await makeCampaignWithActivation();
    const sponsorUser = await prisma.user.create({
      data: { username: "spon1", passwordHash: "x", displayName: "Sponsor One", roleId: "sponsor" },
    });

    const res = await request(app)
      .post(`/admin/v1/campaigns/${campaign.id}/admins`)
      .set("Authorization", `Bearer ${token}`)
      .send({ userId: sponsorUser.id });
    expect(res.status).toBe(201);

    const list = await request(app).get(`/admin/v1/campaigns/${campaign.id}/access`).set("Authorization", `Bearer ${token}`);
    const linked = list.body.data.find((g: any) => g.userId === sponsorUser.id);
    expect(linked).toBeTruthy();
    expect(linked.user.roleId).toBe("sponsor");
  });

  it("creates a new sponsor account inline and links it", async () => {
    const token = await adminToken();
    const { campaign } = await makeCampaignWithActivation();

    const res = await request(app)
      .post(`/admin/v1/campaigns/${campaign.id}/admins`)
      .set("Authorization", `Bearer ${token}`)
      .send({ newUser: { username: "newspon", password: "pw123456", displayName: "New Sponsor", roleId: "sponsor" } });
    expect(res.status).toBe(201);

    const created = await prisma.user.findUnique({ where: { username: "newspon" } });
    expect(created?.roleId).toBe("sponsor");
    expect(await prisma.campaignAccessGrant.findUnique({ where: { userId_campaignId: { userId: created!.id, campaignId: campaign.id } } })).not.toBeNull();
  });

  it("rejects an unknown roleId on inline creation", async () => {
    const token = await adminToken();
    const { campaign } = await makeCampaignWithActivation();

    const res = await request(app)
      .post(`/admin/v1/campaigns/${campaign.id}/admins`)
      .set("Authorization", `Bearer ${token}`)
      .send({ newUser: { username: "badrole", password: "pw123456", displayName: "Bad", roleId: "nope" } });
    expect(res.status).toBe(400);
    expect(await prisma.user.findUnique({ where: { username: "badrole" } })).toBeNull();
  });

  it("admin-candidates returns sponsor accounts when role=sponsor", async () => {
    const token = await adminToken();
    const { campaign } = await makeCampaignWithActivation();
    await prisma.user.createMany({
      data: [
        { username: "spon2", passwordHash: "x", displayName: "Sponsor Two", roleId: "sponsor" },
        { username: "usr2", passwordHash: "x", displayName: "User Two", roleId: "usr" },
      ],
    });

    const res = await request(app)
      .get(`/admin/v1/campaigns/${campaign.id}/admin-candidates?role=sponsor`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((u: any) => u.username);
    expect(ids).toContain("spon2");
    expect(ids).not.toContain("usr2");
  });

  // Deactivated back-office accounts must not be selectable as campaign admins.
  it("admin-candidates excludes deactivated users", async () => {
    const token = await adminToken();
    const { campaign } = await makeCampaignWithActivation();
    await prisma.user.createMany({
      data: [
        { username: "spon3", passwordHash: "x", displayName: "Active Sponsor", roleId: "sponsor" },
        { username: "spon4", passwordHash: "x", displayName: "Deactivated Sponsor", roleId: "sponsor", isActive: false },
      ],
    });

    const res = await request(app)
      .get(`/admin/v1/campaigns/${campaign.id}/admin-candidates?role=sponsor`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((u: any) => u.username);
    expect(ids).toContain("spon3");
    expect(ids).not.toContain("spon4");
  });
});

describe("campaign status manual override (§5.8)", () => {
  it("a manual status survives a subsequent GET; changing dates hands control back", async () => {
    const token = await adminToken();
    const { campaign } = await makeCampaignWithActivation();

    await request(app).patch(`/admin/v1/campaigns/${campaign.id}`).set("Authorization", `Bearer ${token}`).send({ status: "ended" });

    const list = await request(app).get("/admin/v1/campaigns").set("Authorization", `Bearer ${token}`);
    expect(list.body.data.find((c: any) => c.id === campaign.id).status).toBe("ended");

    await request(app).patch(`/admin/v1/campaigns/${campaign.id}`).set("Authorization", `Bearer ${token}`).send({ endDate: "2026-12-31" });
    const list2 = await request(app).get("/admin/v1/campaigns").set("Authorization", `Bearer ${token}`);
    expect(list2.body.data.find((c: any) => c.id === campaign.id).status).toBe("active");
  });
});

describe("RBAC + passwordHash scrub", () => {
  it("a supervisor token 403s on a write and never sees a passwordHash", async () => {
    const adm = await adminToken();
    const { campaign, outlet, staff: promoter } = await makeCampaignWithActivation();

    const supUser = await prisma.user.create({
      data: { username: "sup2", passwordHash: await import("bcrypt").then((b) => b.hash("sup-pw", 4)), displayName: "Sup2", roleId: "supervisor" },
    });
    await prisma.campaignAccessGrant.create({
      data: { userId: supUser.id, campaignId: campaign.id, scopeType: "subset", outletIds: [outlet.id] },
    });
    const supLogin = await request(app).post("/admin/v1/auth/login").send({ username: "sup2", password: "sup-pw" });
    const supTok = supLogin.body.data.accessToken;

    const read = await request(app).get(`/admin/v1/campaigns/${campaign.id}/activations`).set("Authorization", `Bearer ${supTok}`);
    expect(read.status).toBe(200);
    expect(JSON.stringify(read.body)).not.toContain("passwordHash");

    const write = await request(app)
      .post(`/admin/v1/campaigns/${campaign.id}/activations`)
      .set("Authorization", `Bearer ${supTok}`)
      .send({ name: "X", outletId: outlet.id, staffId: promoter.id, dateFrom: "2026-09-01", dateTo: "2026-10-01" });
    expect(write.status).toBe(403);
  });

  it("GET /admin/v1/staff strips passwordHash", async () => {
    const token = await adminToken();
    await makeStaff();
    const res = await request(app).get("/admin/v1/staff").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });
});

describe("zod validation on admin writes", () => {
  it("client create 400s without clientName, 201s with it", async () => {
    const token = await adminToken();
    const bad = await request(app).post("/admin/v1/clients").set("Authorization", `Bearer ${token}`).send({ companyName: "X" });
    expect(bad.status).toBe(400);
    const good = await request(app).post("/admin/v1/clients").set("Authorization", `Bearer ${token}`).send({ companyName: "X", clientName: "Y" });
    expect(good.status).toBe(201);
  });

  it("soft-deletes a referenced brand (#102), keeping the row in the DB", async () => {
    const token = await adminToken();
    const { brand } = await makeCampaignWithActivation(); // brand has an item
    const res = await request(app).delete(`/admin/v1/brands/${brand.id}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.softDeleted).toBe(true);
    expect(await prisma.brand.findUnique({ where: { id: brand.id } })).not.toBeNull();
  });
});
