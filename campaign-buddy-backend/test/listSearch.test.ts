import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, resetDb, adminToken, makeCampaignWithActivation, makeStaff } from "./helpers";
import { prisma } from "../src/utils/prisma";

beforeEach(resetDb);

async function get(path: string, query: Record<string, string> = {}) {
  const token = await adminToken();
  return request(app).get(path).set("Authorization", `Bearer ${token}`).query(query);
}

async function makeCity(name: string) {
  return prisma.city.create({ data: { name, province: "P", district: "D" } });
}

describe("list endpoints honor ?search=", () => {
  it("filters activations by name, outlet, promoter or supervisor", async () => {
    const token = await adminToken();
    const { campaign, outlet, activation } = await makeCampaignWithActivation();
    const promoter = await makeStaff({ fullName: "Promoter Alpha" });
    const otherPromoter = await makeStaff({ fullName: "Other Promoter" });
    const supervisor = await makeStaff({ fullName: "Supervisor Beta", userType: "supervisor" });

    const base = {
      campaignId: campaign.id,
      outletId: outlet.id,
      dateFrom: campaign.startDate,
      dateTo: campaign.endDate,
    };
    await prisma.activation.delete({ where: { id: activation.id } });
    await prisma.activation.create({
      data: { ...base, name: "Matched Activation", staffId: promoter.id, supervisorStaffId: supervisor.id },
    });
    await prisma.activation.create({ data: { ...base, name: "Unrelated Zzz", staffId: otherPromoter.id } });

    const at = (query: Record<string, string>) =>
      request(app).get(`/admin/v1/campaigns/${campaign.id}/activations`).set("Authorization", `Bearer ${token}`).query(query);

    const names = (rows: any[]) => rows.map((a) => a.name);

    expect(names((await at({ search: "matched" })).body.data)).toEqual(["Matched Activation"]);
    expect(names((await at({ search: "MATCHED ACT" })).body.data)).toEqual(["Matched Activation"]);
    expect(names((await at({ search: "outlet" })).body.data)).toHaveLength(2); // both share one outlet
    expect(names((await at({ search: "promoter alpha" })).body.data)).toEqual(["Matched Activation"]);
    expect(names((await at({ search: "supervisor bet" })).body.data)).toEqual(["Matched Activation"]);
    expect((await at({ search: "nope" })).body.data).toHaveLength(0);
    expect((await at({})).body.data).toHaveLength(2); // no search → all
  });

  it("filters cities", async () => {
    await makeCity("Ampara Zone");
    await makeCity("Zeta Point");

    expect((await get("/admin/v1/cities", { search: "ampara" })).body.data.map((c: any) => c.name)).toEqual(["Ampara Zone"]);
    expect((await get("/admin/v1/cities", { search: "nope" })).body.data).toHaveLength(0);
    expect((await get("/admin/v1/cities")).body.data).toHaveLength(2);
  });

  it("filters distributor points", async () => {
    const client = await prisma.client.create({ data: { companyName: "Co", clientName: "C" } });
    const city = await makeCity("Colombo");
    await prisma.distributorPoint.createMany({
      data: [
        { name: "Colombo Depot", cityId: city.id, clientId: client.id },
        { name: "Kandy Depot", cityId: city.id, clientId: client.id },
      ],
    });

    expect((await get("/admin/v1/distributor-points", { search: "kandy" })).body.data.map((d: any) => d.name)).toEqual(["Kandy Depot"]);
    expect((await get("/admin/v1/distributor-points")).body.data).toHaveLength(2);
  });

  it("filters campaigns by name and client name", async () => {
    const token = await adminToken();
    const client2 = await prisma.client.create({ data: { companyName: "Other Co", clientName: "Delta Traders" } });
    const { campaign } = await makeCampaignWithActivation();
    await prisma.campaign.create({
      data: {
        campaignNo: "CMP-ZZ",
        name: "Holiday Season",
        clientId: client2.id,
        startDate: campaign.startDate,
        endDate: campaign.endDate,
      },
    });

    const at = (query: Record<string, string>) =>
      request(app).get("/admin/v1/campaigns").set("Authorization", `Bearer ${token}`).query(query);

    expect((await at({ search: "holiday" })).body.data.map((c: any) => c.name)).toEqual(["Holiday Season"]);
    expect((await at({ search: "delta" })).body.data).toHaveLength(1); // by client name
    expect((await at({ search: "holiday delta" })).body.data).toHaveLength(0); // AND across columns
    expect((await at({})).body.data).toHaveLength(2); // no search → all
  });

  it("filters users by username, displayName, email or role label", async () => {
    await prisma.user.createMany({
      data: [
        { username: "marcus", passwordHash: "x", displayName: "Marcus Aurelius", roleId: "usr" },
        { username: "zeno", passwordHash: "x", displayName: "Zeno Nine", email: "zeno@zeta.lk", roleId: "sponsor" },
      ],
    });

    expect((await get("/admin/v1/users", { search: "marcu" })).body.data).toHaveLength(1);
    expect((await get("/admin/v1/users", { search: "aurelius" })).body.data).toHaveLength(1);
    expect((await get("/admin/v1/users", { search: "zeta.lk" })).body.data).toHaveLength(1); // by email
    expect((await get("/admin/v1/users", { search: "sponsor" })).body.data).toHaveLength(1); // by role label
    expect((await get("/admin/v1/users")).body.data).toHaveLength(3); // both + seeded admin
  });

  it("filters roles by label", async () => {
    expect((await get("/admin/v1/roles", { search: "super admin" })).body.data.map((r: any) => r.id)).toEqual(["adm"]);
    expect((await get("/admin/v1/roles")).body.data).toHaveLength(4);
  });
});
