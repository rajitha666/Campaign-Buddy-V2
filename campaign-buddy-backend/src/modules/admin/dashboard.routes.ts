import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ok, ApiError } from "../../utils/apiResponse";
import { requireCampaignAccess, outletIdsAllowed } from "../../middleware/campaignAccess";
import { colomboYmd, dayDate } from "../../utils/dates";
import { resolveShiftStart } from "../../utils/attendanceWindow";
import { buildAttention, conversionPct, isStaleShift, pctChange, shouldBeCheckedIn, type AttentionType } from "../../utils/dashboardRules";

// GET /campaigns/:campaignId/dashboard (#114) — one aggregated call for the
// portal Overview, replacing seven requests plus a paged walk of every sales
// row. Sums are computed in the database. Additive: no existing endpoint changes.
const router = Router();

const DAY_MS = 86_400_000;
const TREND_DAYS = 30;
const TOP_PRODUCTS = 10;

interface DayAgg {
  sales: number;
  footFall: number;
  approached: number;
  converted: number;
}
const emptyDay = (): DayAgg => ({ sales: 0, footFall: 0, approached: 0, converted: 0 });

router.get(
  "/campaigns/:campaignId/dashboard",
  requireCampaignAccess,
  asyncHandler(async (req, res) => {
    const campaignId = req.params.campaignId;
    const allowed = outletIdsAllowed(req);
    // Sponsors (clients) see campaign performance only: no staff, attendance or location signals.
    const isSponsor = req.user?.roleId === "sponsor";

    const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, deletedAt: null } });
    if (!campaign) throw new ApiError(404, "NOT_FOUND", "Campaign not found");

    const now = new Date();
    const todayYmd = colomboYmd(now);
    const today = dayDate(todayYmd);
    const yesterday = new Date(today.getTime() - DAY_MS);
    const lastWeek = new Date(today.getTime() - 7 * DAY_MS);
    const trendFrom = new Date(today.getTime() - (TREND_DAYS - 1) * DAY_MS);
    const dayKey = (d: Date) => d.toISOString().slice(0, 10);
    const outletFilter = allowed ? { outletId: { in: allowed } } : {};
    const activationWhere = { campaignId, deletedAt: null, ...outletFilter };
    const outletSql = allowed ? Prisma.sql`AND a."outletId" IN (${Prisma.join(allowed.length ? allowed : [""])})` : Prisma.empty;

    // ---- Aggregates (DB-side) ----
    const [salesByDay, statsByDay, topProducts, setupItems, activationRows] = await Promise.all([
      prisma.$queryRaw<{ date: Date; sales: bigint }[]>`
        SELECT sr."date" AS date, COALESCE(SUM(sr."soldToday" * i."unitPrice"), 0)::bigint AS sales
        FROM sales_records sr
        JOIN activation_items ai ON ai."id" = sr."activationItemId"
        JOIN campaign_items ci ON ci."id" = ai."campaignItemId"
        JOIN items i ON i."id" = ci."itemId"
        JOIN activations a ON a."id" = ai."activationId"
        WHERE a."campaignId" = ${campaignId} AND a."deletedAt" IS NULL AND sr."archivedAt" IS NULL
          AND sr."date" >= ${dayKey(trendFrom)}::date AND sr."date" <= ${todayYmd}::date ${outletSql}
        GROUP BY sr."date"`,
      prisma.$queryRaw<{ date: Date; footFall: bigint; approached: bigint; converted: bigint }[]>`
        SELECT ds."date" AS date, COALESCE(SUM(ds."footFall"),0)::bigint AS "footFall",
               COALESCE(SUM(ds."approached"),0)::bigint AS approached, COALESCE(SUM(ds."converted"),0)::bigint AS converted
        FROM daily_stats ds
        JOIN activations a ON a."id" = ds."activationId"
        WHERE a."campaignId" = ${campaignId} AND a."deletedAt" IS NULL
          AND ds."date" >= ${dayKey(trendFrom)}::date AND ds."date" <= ${todayYmd}::date ${outletSql}
        GROUP BY ds."date"`,
      prisma.$queryRaw<{ itemName: string; brandName: string; units: bigint; sales: bigint }[]>`
        SELECT i."name" AS "itemName", b."name" AS "brandName",
               SUM(sr."soldToday")::bigint AS units, SUM(sr."soldToday" * i."unitPrice")::bigint AS sales
        FROM sales_records sr
        JOIN activation_items ai ON ai."id" = sr."activationItemId"
        JOIN campaign_items ci ON ci."id" = ai."campaignItemId"
        JOIN items i ON i."id" = ci."itemId"
        JOIN brands b ON b."id" = i."brandId"
        JOIN activations a ON a."id" = ai."activationId"
        WHERE a."campaignId" = ${campaignId} AND a."deletedAt" IS NULL AND sr."archivedAt" IS NULL
          AND sr."soldToday" > 0 ${outletSql}
        GROUP BY i."id", i."name", b."name"
        ORDER BY sales DESC
        LIMIT ${TOP_PRODUCTS}`,
      prisma.campaignItem.count({ where: { campaignId, deletedAt: null } }),
      prisma.activation.findMany({
        where: activationWhere,
        select: { id: true, outletId: true, staffId: true, dateFrom: true, dateTo: true, shiftStartMinutes: true, shiftEndMinutes: true, staff: { select: { fullName: true } } },
      }),
    ]);

    const byDay = new Map<string, DayAgg>();
    const slot = (d: Date) => {
      const k = dayKey(d);
      let v = byDay.get(k);
      if (!v) byDay.set(k, (v = emptyDay()));
      return v;
    };
    for (const r of salesByDay) slot(r.date).sales = Number(r.sales);
    for (const r of statsByDay) Object.assign(slot(r.date), { footFall: Number(r.footFall), approached: Number(r.approached), converted: Number(r.converted) });
    const dayAgg = (d: Date) => byDay.get(dayKey(d)) ?? emptyDay();

    const trend = Array.from({ length: TREND_DAYS }, (_, i) => {
      const d = new Date(trendFrom.getTime() + i * DAY_MS);
      return { date: dayKey(d), ...dayAgg(d) };
    });

    // ---- Outlets: planned (activation covers today) vs active (a check-in or a sales record today) ----
    const coveringToday = activationRows.filter((a) => a.dateFrom <= today && a.dateTo >= today);
    const plannedOutlets = new Set(coveringToday.map((a) => a.outletId));
    const activationIds = activationRows.map((a) => a.id);
    const outletOf = new Map(activationRows.map((a) => [a.id, a.outletId]));

    const [attendanceToday, salesToday] = await Promise.all([
      prisma.attendanceRecord.findMany({
        where: { date: today, activationId: { in: activationIds } },
        select: { activationId: true, staffId: true, checkInAt: true, checkOutAt: true, checkInLocationVerified: true, status: true },
      }),
      prisma.salesRecord.findMany({
        where: { date: today, archivedAt: null, activationItem: { activationId: { in: activationIds } } },
        select: { activationItem: { select: { activationId: true } } },
      }),
    ]);
    const activeOutlets = new Set<string>();
    for (const r of attendanceToday) if (r.checkInAt) activeOutlets.add(outletOf.get(r.activationId)!);
    const activationsWithSales = new Set(salesToday.map((s) => s.activationItem.activationId));
    for (const id of activationsWithSales) activeOutlets.add(outletOf.get(id)!);

    // ---- Attention (hidden from sponsors) ----
    let attention: ReturnType<typeof buildAttention> = [];
    if (!isSponsor) {
      const counts: Partial<Record<AttentionType, number>> = {};
      const staffIds = [...new Set(activationRows.map((a) => a.staffId))];
      const shiftCampaign = { shiftStartMinutes: campaign.shiftStartMinutes, shiftEndMinutes: campaign.shiftEndMinutes };

      // Promoters expected by now with no check-in (same rule as /absence, per staff across concurrent activations).
      const promoterRecord = new Map(attendanceToday.map((r) => [`${r.activationId}:${r.staffId}`, r]));
      const byStaff = new Map<string, typeof coveringToday>();
      for (const a of coveringToday) byStaff.set(a.staffId, [...(byStaff.get(a.staffId) ?? []), a]);
      let notCheckedIn = 0;
      for (const acts of byStaff.values()) {
        const records = acts.map((a) => promoterRecord.get(`${a.id}:${a.staffId}`)).filter(Boolean);
        const earliest = new Date(Math.min(...acts.map((a) => resolveShiftStart(a, shiftCampaign, today).getTime())));
        if (shouldBeCheckedIn({ shiftStart: earliest, now, checkedIn: records.some((r) => r!.checkInAt), onLeave: records.some((r) => r!.status === "leave") })) notCheckedIn++;
      }
      counts.not_checked_in = notCheckedIn;

      counts.outside_geofence = attendanceToday.filter((r) => r.checkInAt && !r.checkInLocationVerified).length;

      // Open shifts: today's go through the stale-position test, earlier days are simply "still open".
      const openShifts = await prisma.attendanceRecord.findMany({
        where: { checkInAt: { not: null }, checkOutAt: null, date: { lte: today }, activationId: { in: activationIds } },
        select: { activationId: true, staffId: true, date: true, checkInAt: true },
      });
      counts.open_previous_shift = openShifts.filter((s) => s.date < today).length;
      const openToday = openShifts.filter((s) => s.date.getTime() === today.getTime());
      if (openToday.length) {
        const pings = await prisma.trackingPing.groupBy({
          by: ["activationId", "staffId"],
          where: { activationId: { in: openToday.map((s) => s.activationId) }, staffId: { in: openToday.map((s) => s.staffId) }, capturedAt: { gte: new Date(today.getTime() - DAY_MS) } },
          _max: { capturedAt: true },
        });
        const lastPing = new Map(pings.map((p) => [`${p.activationId}:${p.staffId}`, p._max.capturedAt]));
        counts.stale_location = openToday.filter((s) => isStaleShift({ checkInAt: s.checkInAt!, lastPingAt: lastPing.get(`${s.activationId}:${s.staffId}`), now })).length;
      }

      // Outlets whose promoter checked in today but nobody has updated sales.
      const checkedInActivations = new Set(attendanceToday.filter((r) => r.checkInAt).map((r) => r.activationId));
      const noSales = new Set<string>();
      for (const id of checkedInActivations) if (!activationsWithSales.has(id)) noSales.add(outletOf.get(id)!);
      counts.no_sales_update = noSales.size;

      counts.pending_leave = await prisma.leaveRequest.count({ where: { status: "pending", staffId: { in: staffIds } } });
      attention = buildAttention(counts);
    }

    const t = dayAgg(today);
    const y = dayAgg(yesterday);
    const w = dayAgg(lastWeek);
    const headline = (cur: number, prevDay: number, prevWeek: number) => ({
      value: cur, yesterday: prevDay, lastWeek: prevWeek, vsYesterdayPct: pctChange(cur, prevDay), vsLastWeekPct: pctChange(cur, prevWeek),
    });

    res.json(
      ok({
        date: todayYmd,
        view: isSponsor ? "sponsor" : "operations",
        headline: {
          sales: headline(t.sales, y.sales, w.sales),
          approached: headline(t.approached, y.approached, w.approached),
          conversionPct: headline(conversionPct(t.converted, t.approached), conversionPct(y.converted, y.approached), conversionPct(w.converted, w.approached)),
          activeOutlets: { value: activeOutlets.size, planned: plannedOutlets.size },
        },
        attention,
        trend,
        topProducts: topProducts.map((p) => ({ itemName: p.itemName, brandName: p.brandName, units: Number(p.units), sales: Number(p.sales) })),
        setup: {
          products: setupItems,
          activations: activationRows.length,
          promotersAssigned: new Set(activationRows.map((a) => a.staffId)).size,
          complete: setupItems > 0 && activationRows.length > 0,
        },
      })
    );
  })
);

export default router;
