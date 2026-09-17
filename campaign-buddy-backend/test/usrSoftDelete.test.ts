import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { prisma } from "../src/utils/prisma";
import { app, resetDb, adminToken, makeCampaignWithActivation } from "./helpers";

beforeEach(resetDb);

// usr = Campaign Admin. Per #102, every record area's delete is opened to usr
// and becomes a soft delete — the row stays in the DB (deletedAt set /
// staff marked inactive), hidden from all lists.

async function usrToken(username: string, campaignId?: string) {
  await prisma.user.create({
    data: { username, passwordHash: await bcrypt.hash("pw", 4), displayName: username, roleId: "usr" },
  });
  if (campaignId) {
    await prisma.campaignAccessGrant.create({
      data: { userId: (await prisma.user.findFirstOrThrow({ where: { username } })).id, campaignId, scopeType: "all" },
    });
  }
  const res = await request(app).post("/admin/v1/auth/login").send({ username, password: "pw" });
  return res.body.data.accessToken as string;
}

async function softDeleteExpectations(res: request.Response, table: string, id: string) {
  expect(res.status).toBe(200);
  expect(res.body.data.softDeleted).toBe(true);
  const rows: any[] = await prisma.$queryRawUnsafe(`SELECT "deletedAt" AS d FROM ${table} WHERE id = $1`, id);
  expect(rows).toHaveLength(1);
  expect(rows[0].deletedAt).not.toBeNull();
}

describe("usr soft delete — catalog master data", () => {
  let token: string;
  beforeEach(async () => {
    token = await usrToken("usr_catalog");
  });

  it("lets usr soft-delete a client; row stays in DB; hidden from list", async () => {
    const client = await prisma.client.create({ data: { companyName: "Co", clientName: "C" } });
    const res = await request(app).delete(`/admin/v1/clients/${client.id}`).set("Authorization", `Bearer ${token}`);
    await softDeleteExpectations(res, "clients", client.id);

    const list = await request(app).get("/admin/v1/clients").set("Authorization", `Bearer ${token}`);
    expect(list.body.data.some((r: any) => r.id === client.id)).toBe(false);
  });

  it("lets usr soft-delete a brand; hidden from list", async () => {
    const client = await prisma.client.create({ data: { companyName: "Co", clientName: "C" } });
    const brand = await prisma.brand.create({ data: { name: "B", clientId: client.id } });
    const res = await request(app).delete(`/admin/v1/brands/${brand.id}`).set("Authorization", `Bearer ${token}`);
    await softDeleteExpectations(res, "brands", brand.id);

    const list = await request(app).get(`/admin/v1/brands`).set("Authorization", `Bearer ${token}`);
    expect(list.body.data.some((r: any) => r.id === brand.id)).toBe(false);
  });

  it("lets usr soft-delete a city; hidden from list", async () => {
    const city = await prisma.city.create({ data: { name: "City", province: "P", district: "D" } });
    const res = await request(app).delete(`/admin/v1/cities/${city.id}`).set("Authorization", `Bearer ${token}`);
    await softDeleteExpectations(res, "cities", city.id);

    const list = await request(app).get("/admin/v1/cities").set("Authorization", `Bearer ${token}`);
    expect(list.body.data.some((r: any) => r.id === city.id)).toBe(false);
  });

  it("lets usr soft-delete an outlet; hidden from list; outletNo reusable", async () => {
    const city = await prisma.city.create({ data: { name: "City", province: "P", district: "D" } });
    const outlet = await prisma.outlet.create({
      data: { outletNo: "O-DEL-1", name: "Outlet", cityId: city.id, latitude: 6.9, longitude: 79.9 },
    });
    const res = await request(app).delete(`/admin/v1/outlets/${outlet.id}`).set("Authorization", `Bearer ${token}`);
    await softDeleteExpectations(res, "outlets", outlet.id);

    const list = await request(app).get("/admin/v1/outlets").set("Authorization", `Bearer ${token}`);
    expect(list.body.data.some((r: any) => r.id === outlet.id)).toBe(false);

    const reuse = await request(app)
      .post("/admin/v1/outlets")
      .set("Authorization", `Bearer ${token}`)
      .send({ outletNo: "O-DEL-1", name: "Outlet 2", cityId: city.id, latitude: 6.9, longitude: 79.9 });
    expect(reuse.status).toBe(201);
  });

  it("lets usr soft-delete a distributor point; hidden from list", async () => {
    const client = await prisma.client.create({ data: { companyName: "Co", clientName: "C" } });
    const city = await prisma.city.create({ data: { name: "City", province: "P", district: "D" } });
    const dp = await prisma.distributorPoint.create({
      data: { name: "DP", cityId: city.id, clientId: client.id },
    });
    const res = await request(app).delete(`/admin/v1/distributor-points/${dp.id}`).set("Authorization", `Bearer ${token}`);
    await softDeleteExpectations(res, "distributor_points", dp.id);

    const list = await request(app).get("/admin/v1/distributor-points").set("Authorization", `Bearer ${token}`);
    expect(list.body.data.some((r: any) => r.id === dp.id)).toBe(false);
  });
});

describe("usr soft delete — campaigns, activations, operations", () => {
  it("lets usr soft-delete a campaign they have access to; hidden from list; row stays", async () => {
    const { campaign } = await makeCampaignWithActivation();
    const token = await usrToken("usr_campaign", campaign.id);

    const res = await request(app).delete(`/admin/v1/campaigns/${campaign.id}`).set("Authorization", `Bearer ${token}`);
    await softDeleteExpectations(res, "campaigns", campaign.id);

    const list = await request(app).get("/admin/v1/campaigns").set("Authorization", `Bearer ${token}`);
    expect(list.body.data.some((r: any) => r.id === campaign.id)).toBe(false);
  });

  it("lets usr soft-delete an activation; hidden from list; row stays", async () => {
    const { campaign, activation } = await makeCampaignWithActivation();
    const token = await usrToken("usr_activation", campaign.id);

    const res = await request(app)
      .delete(`/admin/v1/campaigns/${campaign.id}/activations/${activation.id}`)
      .set("Authorization", `Bearer ${token}`);
    await softDeleteExpectations(res, "activations", activation.id);

    const list = await request(app)
      .get(`/admin/v1/campaigns/${campaign.id}/activations`)
      .set("Authorization", `Bearer ${token}`);
    expect(list.body.data.some((r: any) => r.id === activation.id)).toBe(false);
  });

  it("lets usr soft-delete a supervisor task; hidden from list; row stays", async () => {
    const { campaign } = await makeCampaignWithActivation();
    const token = await usrToken("usr_task", campaign.id);
    const task = await prisma.supervisorTask.create({
      data: { campaignId: campaign.id, category: "QA", taskType: "feedback", task: "Check fridge" },
    });

    const res = await request(app)
      .delete(`/admin/v1/campaigns/${campaign.id}/supervisor-tasks/${task.id}`)
      .set("Authorization", `Bearer ${token}`);
    await softDeleteExpectations(res, "supervisor_tasks", task.id);

    const list = await request(app)
      .get(`/admin/v1/campaigns/${campaign.id}/supervisor-tasks`)
      .set("Authorization", `Bearer ${token}`);
    expect(list.body.data.some((r: any) => r.id === task.id)).toBe(false);
  });

  it("lets usr soft-delete a supervisor route; hidden from list; row stays", async () => {
    const { campaign, staff } = await makeCampaignWithActivation();
    const token = await usrToken("usr_route", campaign.id);
    await prisma.staff.update({ where: { id: staff.id }, data: { userType: "supervisor" } });
    const route = await prisma.supervisorRoute.create({
      data: {
        campaignId: campaign.id,
        supervisorStaffId: staff.id,
        outletIds: [],
        dateFrom: new Date(),
        dateTo: new Date(),
      },
    });

    const res = await request(app)
      .delete(`/admin/v1/campaigns/${campaign.id}/supervisor-routes/${route.id}`)
      .set("Authorization", `Bearer ${token}`);
    await softDeleteExpectations(res, "supervisor_routes", route.id);

    const list = await request(app)
      .get(`/admin/v1/campaigns/${campaign.id}/supervisor-routes`)
      .set("Authorization", `Bearer ${token}`);
    expect(list.body.data.some((r: any) => r.id === route.id)).toBe(false);
  });

  it("lets usr archive a sales field that already has values (no IN_USE 409)", async () => {
    const { campaign, activation, activationItem } = await makeCampaignWithActivation();
    const token = await usrToken("usr_field", campaign.id);
    const field = await prisma.salesFieldDefinition.create({
      data: { campaignId: campaign.id, key: "cooler-count", label: "Cooler count", type: "number" },
    });
    await prisma.salesFieldValue.create({
      data: {
        definitionId: field.id,
        activationId: activation.id,
        activationItemId: activationItem.id,
        date: new Date(),
        value: "3",
      },
    });

    const res = await request(app)
      .delete(`/admin/v1/campaigns/${campaign.id}/sales-fields/${field.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.softDeleted).toBe(true);
    const stillThere = await prisma.salesFieldDefinition.findUnique({ where: { id: field.id } });
    expect(stillThere).not.toBeNull();
    expect(stillThere?.archivedAt).not.toBeNull();
  });

  it("still rejects usr without a grant on a campaign-scoped delete", async () => {
    const { campaign, activation } = await makeCampaignWithActivation();
    const token = await usrToken("usr_nogrant");

    const res = await request(app)
      .delete(`/admin/v1/campaigns/${campaign.id}/activations/${activation.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe("usr soft delete — staff", () => {
  it("lets usr soft-delete a staff member; always marks inactive, never hard-deletes", async () => {
    const token = await usrToken("usr_staff");
    const staff = await prisma.staff.create({
      data: {
        employeeId: "E-D1",
        fullName: "Del Me",
        mobileUsername: "delme",
        passwordHash: await bcrypt.hash("x", 4),
        displayName: "Del Me",
        userType: "promoter",
        status: "active",
        phone: "0771111111",
      } as any,
    });

    const res = await request(app).delete(`/admin/v1/staff/${staff.id}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.softDeleted).toBe(true);

    const stillThere = await prisma.staff.findUnique({ where: { id: staff.id } });
    expect(stillThere).not.toBeNull();
    expect(stillThere?.status).toBe("inactive");
  });

  it("excludes inactive staff from the staff list after delete", async () => {
    const token = await usrToken("usr_staff2");
    const staff = await prisma.staff.create({
      data: {
        employeeId: "E-D2",
        fullName: "Del Me 2",
        mobileUsername: "delme2",
        passwordHash: await bcrypt.hash("x", 4),
        displayName: "Del Me 2",
        userType: "promoter",
        status: "active",
      } as any,
    });
    await request(app).delete(`/admin/v1/staff/${staff.id}`).set("Authorization", `Bearer ${token}`);

    const list = await request(app).get("/admin/v1/staff").set("Authorization", `Bearer ${token}`);
    expect(list.body.data.some((r: any) => r.id === staff.id)).toBe(false);
  });
});
