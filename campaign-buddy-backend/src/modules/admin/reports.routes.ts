import { Router } from "express";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ok, okList } from "../../utils/apiResponse";
import { requireCampaignAccess, outletIdsAllowed, assertOutletAllowed } from "../../middleware/campaignAccess";
import { dayDate } from "../../utils/dates";
import { activeDefsForCampaign } from "../../utils/salesFieldStore";
import { readFieldValue } from "../../utils/salesFields";

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

// Brand-wise — grouped by (outlet, brand), replacing the old campaign-wide-only
// rollup so a brand's performance can be compared outlet to outlet (client doc D).
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
      include: { activationItem: { include: { campaignItem: { include: { item: { include: { brand: true } } } }, activation: { include: { outlet: true } } } } },
    });
    const byOutletBrand: Record<string, { outletId: string; outletName: string; brandName: string; itemCount: number; totalSales: number }> = {};
    let grandTotal = 0;
    for (const r of records) {
      const outlet = r.activationItem.activation.outlet;
      const brand = r.activationItem.campaignItem.item.brand;
      const value = r.soldToday * r.activationItem.campaignItem.item.unitPrice;
      const key = `${outlet.id}:${brand.id}`;
      byOutletBrand[key] = byOutletBrand[key] ?? { outletId: outlet.id, outletName: outlet.name, brandName: brand.name, itemCount: 0, totalSales: 0 };
      byOutletBrand[key].itemCount += r.soldToday;
      byOutletBrand[key].totalSales += value;
      grandTotal += value;
    }
    const rows = Object.values(byOutletBrand);
    res.json({ data: rows, meta: { total: rows.length, grandTotal } });
  })
);

// Outlet-wise rollup — footfall/approach/conversion (DailyStats) + sales
// (SalesRecord) + target achievement (ActivationTarget), one row per outlet
// (summed across every promoter/activation there), over a date range that
// defaults to today on the portal side. Every one of the campaign's own
// day-scope custom sales fields gets a column too: number-type fields are
// summed over the range, other types show the latest value recorded in the
// range (flagged client-side since that's a snapshot, not a range total).
// Computed, never stored (§5.2).
router.get(
  "/campaigns/:campaignId/reports/outlet-wise",
  requireCampaignAccess,
  asyncHandler(async (req, res) => {
    const outlets = outletScope(req);
    const range = dateRange(req);
    const campaignId = req.params.campaignId;

    const dayDefs = await activeDefsForCampaign(campaignId, "day");
    const numberDefs = dayDefs.filter((d) => d.type === "number");
    const latestDefs = dayDefs.filter((d) => d.type !== "number");

    const [salesRecords, stats, targets, numberValues, latestValues] = await Promise.all([
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
      prisma.activationTarget.findMany({
        where: {
          activation: { campaignId, ...(outlets ? { outletId: { in: outlets } } : {}) },
          ...(range?.lte ? { dateFrom: { lte: range.lte } } : {}),
          ...(range?.gte ? { dateTo: { gte: range.gte } } : {}),
        },
        include: { activation: { include: { outlet: true } } },
      }),
      numberDefs.length
        ? prisma.salesFieldValue.findMany({
            where: {
              definitionId: { in: numberDefs.map((d) => d.id) },
              activationItemId: null,
              ...(range ? { date: range } : {}),
              activation: { campaignId, ...(outlets ? { outletId: { in: outlets } } : {}) },
            },
            include: { activation: { include: { outlet: true } } },
          })
        : Promise.resolve([]),
      latestDefs.length
        ? prisma.salesFieldValue.findMany({
            where: {
              definitionId: { in: latestDefs.map((d) => d.id) },
              activationItemId: null,
              ...(range ? { date: range } : {}),
              activation: { campaignId, ...(outlets ? { outletId: { in: outlets } } : {}) },
            },
            include: { activation: { include: { outlet: true } } },
            orderBy: { date: "asc" }, // last write per outlet below ends up the latest date
          })
        : Promise.resolve([]),
    ]);

    type Row = {
      outletId: string; outletName: string; footFall: number; approached: number; converted: number;
      totalSales: number; target: number; achieved: number; [customFieldKey: string]: unknown;
    };
    const byOutlet: Record<string, Row> = {};
    const ensure = (outlet: { id: string; name: string }) =>
      (byOutlet[outlet.id] = byOutlet[outlet.id] ?? {
        outletId: outlet.id, outletName: outlet.name,
        footFall: 0, approached: 0, converted: 0, totalSales: 0, target: 0, achieved: 0,
        ...Object.fromEntries(numberDefs.map((d) => [d.key, 0])),
        ...Object.fromEntries(latestDefs.map((d) => [d.key, null])),
      });

    for (const r of salesRecords) {
      ensure(r.activationItem.activation.outlet).totalSales += r.soldToday * r.activationItem.campaignItem.item.unitPrice;
    }
    for (const s of stats) {
      const row = ensure(s.activation.outlet);
      row.footFall += s.footFall;
      row.approached += s.approached;
      row.converted += s.converted;
    }

    // Target achievement: for each target overlapping the range, sum the
    // target value and the matching sales already pulled above, clamped to
    // both the target's own window and the report's range.
    const defById = new Map(numberDefs.concat(latestDefs).map((d) => [d.id, d]));
    for (const t of targets) {
      const row = ensure(t.activation.outlet);
      row.target += t.targetValue;
      for (const r of salesRecords) {
        if (r.activationItem.activation.id !== t.activationId) continue;
        const item = r.activationItem.campaignItem.item;
        const matchesScope = t.targetBrandId ? item.brandId === t.targetBrandId : item.id === t.targetItemId;
        if (!matchesScope) continue;
        const recDate = new Date(r.date);
        if (recDate < t.dateFrom || recDate > t.dateTo) continue;
        row.achieved += t.activation.targetUnit === "sales_wise" ? r.soldToday * item.unitPrice : r.soldToday;
      }
    }

    for (const v of numberValues) {
      const row = byOutlet[v.activation.outlet.id];
      const def = defById.get(v.definitionId);
      if (!row || !def) continue;
      row[def.key] = (Number(row[def.key]) || 0) + (Number(v.value) || 0);
    }
    for (const v of latestValues) {
      const row = byOutlet[v.activation.outlet.id];
      const def = defById.get(v.definitionId);
      if (!row || !def) continue;
      row[def.key] = readFieldValue(def, v.value); // ascending order => last assignment wins = latest date
    }

    const rows = Object.values(byOutlet).map((r) => {
      const { achieved, ...rest } = r;
      return { ...rest, achievementPct: r.target > 0 ? Math.round((achieved / r.target) * 1000) / 10 : 0 };
    });
    res.json({
      data: rows,
      meta: {
        total: rows.length,
        customFieldDefs: dayDefs.map((d) => ({ key: d.key, label: d.label, type: d.type })),
      },
    });
  })
);

// Daily submission-compliance — every activation running on the given day,
// left-joined against that day's AttendanceRecord (checked in at all?) and
// SalesSummary (confirmed = the promoter actually submitted their sales), so
// an activation that never submitted still shows up instead of being
// silently dropped. Three-way status (client doc D):
//   completed — sales confirmed
//   absent    — never checked in (same definition as the Staff Absence report)
//   pending   — checked in, sales not yet confirmed
router.get(
  "/campaigns/:campaignId/reports/sales-status",
  requireCampaignAccess,
  asyncHandler(async (req, res) => {
    const outlets = outletScope(req);
    const when = dayDate(typeof req.query.date === "string" ? req.query.date : undefined);
    const campaignId = req.params.campaignId;

    const activations = await prisma.activation.findMany({
      where: {
        campaignId,
        deletedAt: null,
        dateFrom: { lte: when },
        dateTo: { gte: when },
        ...(outlets ? { outletId: { in: outlets } } : {}),
      },
      include: {
        outlet: true,
        staff: true,
        salesSummaries: { where: { date: when } },
        attendanceRecords: { where: { date: when } },
      },
    });

    const rows = activations.map((a) => {
      const confirmed = a.salesSummaries[0]?.confirmed ?? false;
      // Only the promoter's own check-in counts, not a covering supervisor's on the same activation.
      const checkedIn = a.attendanceRecords.some((r) => r.staffId === a.staffId && r.checkInAt);
      const status: "completed" | "pending" | "absent" = confirmed ? "completed" : checkedIn ? "pending" : "absent";
      return {
        activationId: a.id,
        outletName: a.outlet.name,
        staffName: a.staff.fullName,
        status,
      };
    });
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
        if (rec.staffId !== a.staffId) continue; // a covering supervisor's visit isn't the promoter's attendance
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
