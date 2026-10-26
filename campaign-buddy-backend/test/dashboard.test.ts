import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app, resetDb, adminToken, makeCampaignWithActivation, makeStaff } from "./helpers";
import { prisma } from "../src/utils/prisma";
import { colomboYmd, dayDate } from "../src/utils/dates";

beforeEach(resetDb);

const DAY = 86_400_000;
const url = (campaignId: string) => `/admin/v1/campaigns/${campaignId}/dashboard`;

async function userWithGrant(roleId: "sponsor" | "supervisor", campaignId: string, outletIds: string[] | null) {
  const username = `${roleId}_${Math.random().toString(36).slice(2, 7)}`;
  const user = await prisma.user.create({
    data: { username, passwordHash: await bcrypt.hash("pw-12345", 4), displayName: roleId, roleId },
  });
  await prisma.campaignAccessGrant.create({
    data: { userId: user.id, campaignId, scopeType: outletIds ? "subset" : "all", outletIds: outletIds ?? [] },
  });
  return adminToken(username, "pw-12345");
}

describe("GET /admin/v1/campaigns/:id/dashboard (#114)", () => {
  it("sums sales in the database and compares today with yesterday and last week", async () => {
    const { campaign, activation, activationItem } = await makeCampaignWithActivation();
    const today = dayDate();
    for (const [offset, sold] of [[0, 5], [-1, 4], [-7, 2]] as const) {
      await prisma.salesRecord.create({ data: { activationItemId: activationItem.id, date: new Date(today.getTime() + offset * DAY), soldToday: sold } });
    }
    await prisma.dailyStats.create({ data: { activationId: activation.id, date: today, footFall: 40, approached: 10, converted: 5 } });

    const res = await request(app).get(url(campaign.id)).set("Authorization", `Bearer ${await adminToken()}`);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.date).toBe(colomboYmd());
    expect(d.headline.sales).toMatchObject({ value: 5000, yesterday: 4000, lastWeek: 2000, vsYesterdayPct: 25, vsLastWeekPct: 150 });
    expect(d.headline.conversionPct.value).toBe(50);
    expect(d.headline.approached.vsYesterdayPct).toBeNull();
    expect(d.trend).toHaveLength(30);
    expect(d.trend[29]).toMatchObject({ date: colomboYmd(), sales: 5000, footFall: 40 });
    expect(d.topProducts[0]).toMatchObject({ itemName: "Item 1", units: 11, sales: 11000 });
  });

  it("ignores archived sales rows", async () => {
    const { campaign, activationItem } = await makeCampaignWithActivation();
    await prisma.salesRecord.create({ data: { activationItemId: activationItem.id, date: dayDate(), soldToday: 9, archivedAt: new Date() } });
    const res = await request(app).get(url(campaign.id)).set("Authorization", `Bearer ${await adminToken()}`);
    expect(res.body.data.headline.sales.value).toBe(0);
  });

  it("flags a promoter whose shift started but who has not checked in, and links to the fix", async () => {
    const { campaign, staff } = await makeCampaignWithActivation();
    await prisma.campaign.update({ where: { id: campaign.id }, data: { shiftStartMinutes: 0, shiftEndMinutes: 1439 } });
    await prisma.leaveRequest.create({ data: { staffId: staff.id, fromDate: dayDate(), toDate: dayDate(), reason: "sick_leave" } });

    const res = await request(app).get(url(campaign.id)).set("Authorization", `Bearer ${await adminToken()}`);
    const types = res.body.data.attention.map((a: { type: string }) => a.type);
    expect(types).toContain("not_checked_in");
    expect(types).toContain("pending_leave");
    expect(res.body.data.attention[0]).toMatchObject({ type: "not_checked_in", severity: "high", link: "/staff/absence" });
  });

  it("counts a geofence miss, a stale open shift and an outlet with no sales update", async () => {
    const { campaign, activation, staff } = await makeCampaignWithActivation();
    await prisma.attendanceRecord.create({
      data: { activationId: activation.id, staffId: staff.id, date: dayDate(), checkInAt: new Date(Date.now() - 30 * 60_000), checkInLocationVerified: false, status: "on_time" },
    });
    const res = await request(app).get(url(campaign.id)).set("Authorization", `Bearer ${await adminToken()}`);
    const byType = Object.fromEntries(res.body.data.attention.map((a: { type: string; count: number }) => [a.type, a.count]));
    expect(byType).toMatchObject({ outside_geofence: 1, stale_location: 1, no_sales_update: 1 });
    expect(res.body.data.headline.activeOutlets).toEqual({ value: 1, planned: 1 });
  });

  it("returns no staff-level attention items to a sponsor", async () => {
    const { campaign, activation, staff } = await makeCampaignWithActivation();
    await prisma.attendanceRecord.create({
      data: { activationId: activation.id, staffId: staff.id, date: dayDate(), checkInAt: new Date(Date.now() - 30 * 60_000), checkInLocationVerified: false, status: "on_time" },
    });
    const sponsor = await userWithGrant("sponsor", campaign.id, null);
    const res = await request(app).get(url(campaign.id)).set("Authorization", `Bearer ${sponsor}`);
    expect(res.status).toBe(200);
    expect(res.body.data.view).toBe("sponsor");
    expect(res.body.data.attention).toEqual([]);
  });

  it("limits a supervisor to their outlets", async () => {
    const { campaign, outlet, city, item, staff } = await makeCampaignWithActivation();
    const otherOutlet = await prisma.outlet.create({ data: { outletNo: "OTHER", name: "Other", cityId: city.id, latitude: 6.8, longitude: 79.8 } });
    const other = await prisma.activation.create({
      data: { name: "Other", campaignId: campaign.id, outletId: otherOutlet.id, staffId: (await makeStaff()).id, dateFrom: campaign.startDate, dateTo: campaign.endDate },
    });
    const ci = await prisma.campaignItem.findFirstOrThrow({ where: { campaignId: campaign.id, itemId: item.id } });
    const otherAi = await prisma.activationItem.create({ data: { activationId: other.id, campaignItemId: ci.id } });
    await prisma.salesRecord.create({ data: { activationItemId: otherAi.id, date: dayDate(), soldToday: 7 } });

    const sup = await userWithGrant("supervisor", campaign.id, [outlet.id]);
    const res = await request(app).get(url(campaign.id)).set("Authorization", `Bearer ${sup}`);
    expect(res.status).toBe(200);
    expect(res.body.data.headline.sales.value).toBe(0);
    expect(res.body.data.headline.activeOutlets.planned).toBe(1);
    expect(staff.id).toBeTruthy();
  });

  it("denies a user with no grant on the campaign", async () => {
    const { campaign } = await makeCampaignWithActivation();
    const { campaign: other } = await makeCampaignWithActivation();
    const sponsor = await userWithGrant("sponsor", other.id, null);
    const res = await request(app).get(url(campaign.id)).set("Authorization", `Bearer ${sponsor}`);
    expect(res.status).toBe(403);
  });

  it("reports an empty setup state for a new campaign", async () => {
    const { campaign, activation, campaignItem } = await makeCampaignWithActivation();
    await prisma.activation.delete({ where: { id: activation.id } }).catch(() => undefined);
    await prisma.campaignItem.update({ where: { id: campaignItem.id }, data: { deletedAt: new Date() } }).catch(() => undefined);
    const res = await request(app).get(url(campaign.id)).set("Authorization", `Bearer ${await adminToken()}`);
    expect(res.body.data.setup).toMatchObject({ products: 0, activations: 0, complete: false });
  });
});
