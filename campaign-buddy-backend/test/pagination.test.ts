import { describe, expect, it, beforeEach } from "vitest";
import request from "supertest";
import { app, resetDb, adminToken, makeCampaignWithActivation, makeStaff } from "./helpers";
import { prisma } from "../src/utils/prisma";

// Server-side paging added to the campaign-scoped log endpoints — portal
// /admin/v1 list contract (§4.2): ?page=&pageSize= returns just that page and
// meta.total is the unfiltered-by-page count.
beforeEach(resetDb);

const day = (offset: number) => new Date(Date.now() + offset * 86400000);

async function makeActivationRows(campaignId: string, outletId: string, staffId: string, count: number) {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const activation = await prisma.activation.create({
      data: { name: `A${i}`, campaignId, outletId, staffId, dateFrom: new Date(Date.now() - 3 * 86400000), dateTo: new Date(Date.now() + 20 * 86400000) },
    });
    ids.push(activation.id);
  }
  return ids;
}

describe("campaign-scoped list pagination", () => {
  it("GET attendance honors page/pageSize and meta.total counts every row", async () => {
    const { campaign, outlet, staff } = await makeCampaignWithActivation();
    const activationIds = await makeActivationRows(campaign.id, outlet.id, staff.id, 5);
    for (let i = 0; i < 5; i++) {
      await prisma.attendanceRecord.create({ data: { activationId: activationIds[i], date: day(i), checkInAt: new Date(), status: "on_time" } });
    }
    const res = await request(app)
      .get(`/admin/v1/campaigns/${campaign.id}/attendance`)
      .query({ page: 2, pageSize: 2 })
      .set("Authorization", `Bearer ${await adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.total).toBe(5);
  });

  it("GET attendance returns an empty page while meta.total stays accurate", async () => {
    const { campaign, outlet, staff } = await makeCampaignWithActivation();
    const activationIds = await makeActivationRows(campaign.id, outlet.id, staff.id, 3);
    for (let i = 0; i < 3; i++) {
      await prisma.attendanceRecord.create({ data: { activationId: activationIds[i], date: day(i), checkInAt: new Date(), status: "on_time" } });
    }
    const res = await request(app)
      .get(`/admin/v1/campaigns/${campaign.id}/attendance`)
      .query({ page: 3, pageSize: 2 })
      .set("Authorization", `Bearer ${await adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.meta.total).toBe(3);
  });

  it("GET sales honors page/pageSize with meta.total", async () => {
    const { campaign, activationItem } = await makeCampaignWithActivation();
    for (let i = 0; i < 5; i++) {
      await prisma.salesRecord.create({ data: { activationItemId: activationItem.id, date: day(i), openingStock: 50, soldToday: i } });
    }
    const res = await request(app)
      .get(`/admin/v1/campaigns/${campaign.id}/sales`)
      .query({ page: 2, pageSize: 2 })
      .set("Authorization", `Bearer ${await adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.total).toBe(5);
  });

  it("GET tracking/promoter-history honors page/pageSize with meta.total", async () => {
    const { campaign, activation } = await makeCampaignWithActivation();
    for (let i = 0; i < 5; i++) {
      await prisma.trackingPing.create({
        data: { activationId: activation.id, latitude: 6.9 + i * 0.01, longitude: 79.9, capturedAt: new Date(Date.now() + i * 60_000) },
      });
    }
    const res = await request(app)
      .get(`/admin/v1/campaigns/${campaign.id}/tracking/promoter-history`)
      .query({ page: 2, pageSize: 2 })
      .set("Authorization", `Bearer ${await adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.total).toBe(5);
  });

  it("GET leave-requests honors page/pageSize with meta.total", async () => {
    const { campaign, staff } = await makeCampaignWithActivation();
    for (let i = 0; i < 5; i++) {
      await prisma.leaveRequest.create({
        data: { staffId: staff.id, fromDate: day(i), toDate: day(i), reason: "other" },
      });
    }
    const res = await request(app)
      .get(`/admin/v1/campaigns/${campaign.id}/leave-requests`)
      .query({ page: 2, pageSize: 2 })
      .set("Authorization", `Bearer ${await adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.total).toBe(5);
  });

  it("GET outlet-attendance honors page/pageSize with meta.total", async () => {
    const { campaign, outlet, staff } = await makeCampaignWithActivation();
    await prisma.staff.update({ where: { id: staff.id }, data: { userType: "supervisor" } });
    const activationIds = await makeActivationRows(campaign.id, outlet.id, staff.id, 3);
    for (let i = 0; i < 3; i++) {
      await prisma.attendanceRecord.create({ data: { activationId: activationIds[i], date: day(i), checkInAt: new Date(), status: "on_time" } });
    }
    const res = await request(app)
      .get(`/admin/v1/campaigns/${campaign.id}/outlet-attendance`)
      .query({ page: 2, pageSize: 2 })
      .set("Authorization", `Bearer ${await adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(3);
  });

  it("GET absence slices its computed list per page, meta.total is the full count", async () => {
    const { campaign, outlet } = await makeCampaignWithActivation();
    for (let i = 0; i < 3; i++) {
      const extra = await makeStaff();
      await prisma.activation.create({
        data: { name: `A${i}`, campaignId: campaign.id, outletId: outlet.id, staffId: extra.id, dateFrom: campaign.startDate, dateTo: campaign.endDate },
      });
    }
    const res = await request(app)
      .get(`/admin/v1/campaigns/${campaign.id}/absence`)
      .query({ date: new Date().toISOString().slice(0, 10), page: 2, pageSize: 2 })
      .set("Authorization", `Bearer ${await adminToken()}`);
    expect(res.status).toBe(200);
    // 4 total absent staff (base activation + 3 extras, none checked in),
    // page 2 of 2-page-size → 2 rows
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.total).toBe(4);
  });
});
