import { Router } from "express";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ok } from "../../utils/apiResponse";
import { requireCampaignAccess, outletIdsAllowed } from "../../middleware/campaignAccess";

const router = Router();

// Confirmed v3 (§5.10): ONE set of report endpoints. A Sponsor calling these gets
// the identical response, auto-filtered by their CampaignAccessGrant via
// outletIdsAllowed() below — there is no separate "-client" route anywhere.

router.get(
  "/campaigns/:campaignId/reports/sku-wise",
  requireCampaignAccess,
  asyncHandler(async (req, res) => {
    const allowed = outletIdsAllowed(req);
    const records = await prisma.salesRecord.findMany({
      where: { activationItem: { activation: { campaignId: req.params.campaignId, ...(allowed ? { outletId: { in: allowed } } : {}) } } },
      include: { activationItem: { include: { campaignItem: { include: { item: true } } } } },
    });
    const byItem: Record<string, { itemCount: number; totalSales: number }> = {};
    let grandTotal = 0;
    for (const r of records) {
      const name = r.activationItem.campaignItem.item.name;
      const value = r.soldToday * r.activationItem.campaignItem.item.unitPrice;
      byItem[name] = byItem[name] ?? { itemCount: 0, totalSales: 0 };
      byItem[name].itemCount += r.soldToday;
      byItem[name].totalSales += value;
      grandTotal += value;
    }
    res.json(ok({ rows: Object.entries(byItem).map(([item, v]) => ({ item, ...v })), grandTotal }));
  })
);

router.get(
  "/campaigns/:campaignId/reports/brand-wise",
  requireCampaignAccess,
  asyncHandler(async (req, res) => {
    const allowed = outletIdsAllowed(req);
    const records = await prisma.salesRecord.findMany({
      where: { activationItem: { activation: { campaignId: req.params.campaignId, ...(allowed ? { outletId: { in: allowed } } : {}) } } },
      include: { activationItem: { include: { campaignItem: { include: { item: { include: { brand: true } } } } } } },
    });
    const byBrand: Record<string, { itemCount: number; totalSales: number }> = {};
    let grandTotal = 0;
    for (const r of records) {
      const name = r.activationItem.campaignItem.item.brand.name;
      const value = r.soldToday * r.activationItem.campaignItem.item.unitPrice;
      byBrand[name] = byBrand[name] ?? { itemCount: 0, totalSales: 0 };
      byBrand[name].itemCount += r.soldToday;
      byBrand[name].totalSales += value;
      grandTotal += value;
    }
    res.json(ok({ rows: Object.entries(byBrand).map(([brand, v]) => ({ brand, ...v })), grandTotal }));
  })
);

router.get(
  "/campaigns/:campaignId/reports/reorder",
  requireCampaignAccess,
  asyncHandler(async (req, res) => {
    const allowed = outletIdsAllowed(req);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const rows = await prisma.salesRecord.findMany({
      where: {
        date: today,
        reorderFlag: true,
        activationItem: { activation: { campaignId: req.params.campaignId, ...(allowed ? { outletId: { in: allowed } } : {}) } },
      },
      include: { activationItem: { include: { campaignItem: { include: { item: true } }, activation: { include: { outlet: true } } } } },
    });
    res.json(ok(rows));
  })
);

router.get(
  "/campaigns/:campaignId/reports/attendance-monthly",
  requireCampaignAccess,
  asyncHandler(async (req, res) => {
    const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);
    const [year, mo] = month.split("-").map(Number);
    const from = new Date(year, mo - 1, 1);
    const to = new Date(year, mo, 0);
    const allowed = outletIdsAllowed(req);

    const rows = await prisma.attendanceRecord.findMany({
      where: {
        date: { gte: from, lte: to },
        activation: { campaignId: req.params.campaignId, ...(allowed ? { outletId: { in: allowed } } : {}) },
      },
      include: { activation: { include: { staff: true, outlet: true } } },
    });
    res.json(ok(rows));
  })
);

export default router;
