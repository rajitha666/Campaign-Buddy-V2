import { Router } from "express";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ok, okList } from "../../utils/apiResponse";
import { requireCampaignAccess, outletIdsAllowed, assertOutletAllowed } from "../../middleware/campaignAccess";
import { dayDate } from "../../utils/dates";

const router = Router();

// Confirmed v3 (§5.10): ONE set of report endpoints. A Sponsor calling these gets
// the identical response, auto-filtered by their CampaignAccessGrant via
// outletIdsAllowed() below — there is no separate "-client" route anywhere.
//
// List-shaped reports return the rows as `data` (with `meta.total` and, where it
// applies, `meta.grandTotal`) so the portal's generic ResourcePage can render
// them like any other table.

type Range = { gte?: Date; lte?: Date };
function dateRange(req: any): Range | undefined {
  const { dateFrom, dateTo } = req.query as { dateFrom?: string; dateTo?: string };
  if (!dateFrom && !dateTo) return undefined;
  return { ...(dateFrom ? { gte: dayDate(dateFrom) } : {}), ...(dateTo ? { lte: dayDate(dateTo) } : {}) };
}
function outletScope(req: any): string[] | undefined {
  const explicit = req.query.outletId as string | undefined;
  if (explicit) { assertOutletAllowed(req, explicit); return [explicit]; }
  return outletIdsAllowed(req);
}

router.get(
  "/campaigns/:campaignId/reports/sku-wise",
  requireCampaignAccess,
  asyncHandler(async (req, res) => {
    const outlets = outletScope(req);
    const range = dateRange(req);
    const records = await prisma.salesRecord.findMany({
      where: {
        ...(range ? { date: range } : {}),
        activationItem: { activation: { campaignId: req.params.campaignId, ...(outlets ? { outletId: { in: outlets } } : {}) } },
      },
      include: { activationItem: { include: { campaignItem: { include: { item: { include: { brand: true } } } } } } },
    });
    const byItem: Record<string, { itemName: string; brandName: string; itemCount: number; totalSales: number }> = {};
    let grandTotal = 0;
    for (const r of records) {
      const item = r.activationItem.campaignItem.item;
      const value = r.soldToday * item.unitPrice;
      byItem[item.id] = byItem[item.id] ?? { itemName: item.name, brandName: item.brand.name, itemCount: 0, totalSales: 0 };
      byItem[item.id].itemCount += r.soldToday;
      byItem[item.id].totalSales += value;
      grandTotal += value;
    }
    const rows = Object.values(byItem);
    res.json({ data: rows, meta: { total: rows.length, grandTotal } });
  })
);

router.get(
  "/campaigns/:campaignId/reports/brand-wise",
  requireCampaignAccess,
  asyncHandler(async (req, res) => {
    const outlets = outletScope(req);
    const range = dateRange(req);
    const records = await prisma.salesRecord.findMany({
      where: {
        ...(range ? { date: range } : {}),
        activationItem: { activation: { campaignId: req.params.campaignId, ...(outlets ? { outletId: { in: outlets } } : {}) } },
      },
      include: { activationItem: { include: { campaignItem: { include: { item: { include: { brand: true } } } } } } },
    });
    const byBrand: Record<string, { brandName: string; itemCount: number; totalSales: number }> = {};
    let grandTotal = 0;
    for (const r of records) {
      const brand = r.activationItem.campaignItem.item.brand;
      const value = r.soldToday * r.activationItem.campaignItem.item.unitPrice;
      byBrand[brand.id] = byBrand[brand.id] ?? { brandName: brand.name, itemCount: 0, totalSales: 0 };
      byBrand[brand.id].itemCount += r.soldToday;
      byBrand[brand.id].totalSales += value;
      grandTotal += value;
    }
    const rows = Object.values(byBrand);
    res.json({ data: rows, meta: { total: rows.length, grandTotal } });
  })
);

// Outlet-wise rollup — footfall (DailyStats) + sales (SalesRecord) per outlet.
// Added for portal completion; computed, never stored (§5.2).
router.get(
  "/campaigns/:campaignId/reports/outlet-wise",
  requireCampaignAccess,
  asyncHandler(async (req, res) => {
    const outlets = outletScope(req);
    const range = dateRange(req);
    const campaignId = req.params.campaignId;

    const [salesRecords, stats] = await Promise.all([
      prisma.salesRecord.findMany({
        where: {
          ...(range ? { date: range } : {}),
          activationItem: { activation: { campaignId, ...(outlets ? { outletId: { in: outlets } } : {}) } },
        },
        include: { activationItem: { include: { campaignItem: { include: { item: true } }, activation: { include: { outlet: true } } } } },
      }),
      prisma.dailyStats.findMany({
        where: {
          ...(range ? { date: range } : {}),
          activation: { campaignId, ...(outlets ? { outletId: { in: outlets } } : {}) },
        },
        include: { activation: { include: { outlet: true } } },
      }),
    ]);

    const byOutlet: Record<string, { outletId: string; outletName: string; footFall: number; totalSales: number }> = {};
    const ensure = (id: string, name: string) => (byOutlet[id] = byOutlet[id] ?? { outletId: id, outletName: name, footFall: 0, totalSales: 0 });
    for (const r of salesRecords) {
      const o = r.activationItem.activation.outlet;
      ensure(o.id, o.name).totalSales += r.soldToday * r.activationItem.campaignItem.item.unitPrice;
    }
    for (const s of stats) {
      const o = s.activation.outlet;
      ensure(o.id, o.name).footFall += s.footFall;
    }
    const rows = Object.values(byOutlet);
    res.json(okList(rows, rows.length));
  })
);

router.get(
  "/campaigns/:campaignId/reports/reorder",
  requireCampaignAccess,
  asyncHandler(async (req, res) => {
    const outlets = outletScope(req);
    const brandId = req.query.brandId as string | undefined;
    const day = dayDate(req.query.date as string | undefined);
    const records = await prisma.salesRecord.findMany({
      where: {
        date: day,
        reorderFlag: true,
        activationItem: {
          ...(brandId ? { campaignItem: { item: { brandId } } } : {}),
          activation: { campaignId: req.params.campaignId, ...(outlets ? { outletId: { in: outlets } } : {}) },
        },
      },
      include: { activationItem: { include: { campaignItem: { include: { item: { include: { brand: true } } } }, activation: { include: { outlet: true } } } } },
    });
    const rows = records.map((r) => ({
      id: r.id,
      itemName: r.activationItem.campaignItem.item.name,
      brandId: r.activationItem.campaignItem.item.brandId,
      brandName: r.activationItem.campaignItem.item.brand.name,
      outletName: r.activationItem.activation.outlet.name,
      activationName: r.activationItem.activation.name,
      date: r.date,
      openingStock: r.openingStock,
      soldToday: r.soldToday,
      remainingStock: r.openingStock - r.soldToday,
    }));
    res.json(okList(rows, rows.length));
  })
);

// Monthly attendance grid — one row per (staff, outlet), a per-day-of-month map
// of ✓ present / A absent / L on-leave / · not-yet-started.
router.get(
  "/campaigns/:campaignId/reports/attendance-monthly",
  requireCampaignAccess,
  asyncHandler(async (req, res) => {
    const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);
    const [year, mo] = month.split("-").map(Number);
    const from = new Date(year, mo - 1, 1);
    const to = new Date(year, mo, 0);
    const daysInMonth = to.getDate();
    const outlets = outletScope(req);

    const activations = await prisma.activation.findMany({
      where: { campaignId: req.params.campaignId, ...(outlets ? { outletId: { in: outlets } } : {}) },
      include: {
        staff: true,
        outlet: true,
        attendanceRecords: { where: { date: { gte: from, lte: to } } },
      },
    });

    const rows = activations.map((a) => {
      const days: Record<number, string> = {};
      for (const rec of a.attendanceRecords) {
        const d = new Date(rec.date).getUTCDate(); // @db.Date is stored at UTC midnight
        days[d] =
          rec.status === "leave" ? "L" :
          rec.checkInAt ? "✓" :
          rec.status === "absent" ? "A" : "·";
      }
      return { activationId: a.id, staffName: a.staff.fullName, outletName: a.outlet.name, days };
    });

    res.json(ok({ rows, days: Array.from({ length: daysInMonth }, (_, i) => i + 1) }));
  })
);

export default router;
