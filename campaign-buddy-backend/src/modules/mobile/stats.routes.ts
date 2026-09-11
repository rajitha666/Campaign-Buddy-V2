import { Router } from "express";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError, ok } from "../../utils/apiResponse";
import { computeTotalSales } from "../../utils/salesCalc";
import { dayDate } from "../../utils/dates";
import { validate } from "../../middleware/validate";
import { s } from "../../schemas";

const router = Router();
function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }

// docs/api-spec.md §2.7 / §6.1 — DailyStats with the derived conversionRate.
function toDailyStats(s: { footFall: number; approached: number; converted: number }, totalSales: number) {
  return {
    footFall: s.footFall,
    approached: s.approached,
    converted: s.converted,
    conversionRate: s.approached > 0 ? s.converted / s.approached : 0,
    totalSales,
  };
}

async function currentActivation(staffId: string) {
  const today = startOfDay(new Date());
  return prisma.activation.findFirst({
    where: { staffId, dateFrom: { lte: today }, dateTo: { gte: today } },
  });
}

router.get(
  "/stats/today",
  asyncHandler(async (req, res) => {
    const activation = await currentActivation(req.staff!.sub);
    const today = startOfDay(new Date());
    if (!activation) {
      res.json(ok(toDailyStats({ footFall: 0, approached: 0, converted: 0 }, 0)));
      return;
    }
    const stats = await prisma.dailyStats.findUnique({
      where: { activationId_date: { activationId: activation.id, date: today } },
    });
    const totalSales = await computeTotalSales(prisma, activation.id, today);
    res.json(ok(toDailyStats(
      { footFall: stats?.footFall ?? 0, approached: stats?.approached ?? 0, converted: stats?.converted ?? 0 },
      totalSales
    )));
  })
);

router.patch(
  "/stats/today",
  validate({ body: s.statsUpdate }),
  asyncHandler(async (req, res) => {
    const activation = await currentActivation(req.staff!.sub);
    if (!activation) throw new ApiError(422, "NO_ACTIVATION", "No active assignment for today — contact your supervisor");
    const today = startOfDay(new Date());
    const { footFall, approached, converted } = req.body as { footFall?: number; approached?: number; converted?: number };

    const stats = await prisma.dailyStats.upsert({
      where: { activationId_date: { activationId: activation.id, date: today } },
      create: { activationId: activation.id, date: today, footFall: footFall ?? 0, approached: approached ?? 0, converted: converted ?? 0 },
      update: { ...(footFall != null ? { footFall } : {}), ...(approached != null ? { approached } : {}), ...(converted != null ? { converted } : {}) },
    });
    const totalSales = await computeTotalSales(prisma, activation.id, today);
    res.json(ok(toDailyStats(stats, totalSales)));
  })
);

// docs/api-spec.md §6.3 — the rep's own day-level rollups over a date range
// (backing the Sales tab's "Last 7 days" section). totalSales/itemsSold are
// computed live from SalesRecord + Item.unitPrice, never stored (§5.2).
router.get(
  "/stats/range",
  asyncHandler(async (req, res) => {
    const q = req.query as { dateFrom?: string; dateTo?: string };
    // Cap the window so a bogus query can't pull the whole campaign history.
    const to = dayDate(q.dateTo);
    if (isNaN(to.getTime())) throw new ApiError(400, "BAD_DATE", "Invalid dateTo");
    const from = dayDate(q.dateFrom ?? new Date(to.getTime() - 6 * 86400000).toISOString());
    if (isNaN(from.getTime())) throw new ApiError(400, "BAD_DATE", "Invalid dateFrom");
    const [lo, hi] = from.getTime() <= to.getTime() ? [from, to] : [to, from];
    if (hi.getTime() - lo.getTime() > 89 * 86400000) {
      throw new ApiError(400, "RANGE_TOO_LARGE", "Date range cannot exceed 90 days");
    }

    const activations = await prisma.activation.findMany({
      where: { staffId: req.staff!.sub, dateFrom: { lte: hi }, dateTo: { gte: lo } },
      select: { id: true },
    });
    const activationIds = activations.map((a) => a.id);

    const [dailyStats, salesRecords] = activationIds.length
      ? await Promise.all([
          prisma.dailyStats.findMany({
            where: { activationId: { in: activationIds }, date: { gte: lo, lte: hi } },
          }),
          prisma.salesRecord.findMany({
            where: { activationItem: { activationId: { in: activationIds } }, date: { gte: lo, lte: hi } },
            include: { activationItem: { include: { campaignItem: { include: { item: true } } } } },
          }),
        ])
      : [[], []];

    const days: Map<string, {
      date: string; itemsReceived: number; itemsSold: number; totalSales: number;
      footFall: number; approached: number; converted: number;
    }> = new Map();
    for (let d = new Date(lo); d.getTime() <= hi.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      days.set(key, { date: key, itemsReceived: 0, itemsSold: 0, totalSales: 0, footFall: 0, approached: 0, converted: 0 });
    }

    for (const stats of dailyStats) {
      const row = days.get(stats.date.toISOString().slice(0, 10));
      if (!row) continue;
      row.footFall += stats.footFall;
      row.approached += stats.approached;
      row.converted += stats.converted;
    }
    for (const rec of salesRecords) {
      const row = days.get(rec.date.toISOString().slice(0, 10));
      if (!row) continue;
      row.itemsReceived += rec.openingStock;
      row.itemsSold += rec.soldToday;
      row.totalSales += rec.soldToday * rec.activationItem.campaignItem.item.unitPrice;
    }

    interface DayCore {
      itemsReceived: number;
      itemsSold: number;
      totalSales: number;
      footFall: number;
      approached: number;
      converted: number;
    }
    const serialize = (core: DayCore): DayCore & { conversionRate: number } => ({
      ...core,
      conversionRate: core.approached > 0 ? core.converted / core.approached : 0,
    });

    // One row per calendar day in the range, ascending.
    const dayRows = [...days.values()].map(({ date, ...core }) => ({ date, ...serialize(core) }));
    const total = serialize(dayRows.reduce(
      (acc, d) => ({
        itemsReceived: acc.itemsReceived + d.itemsReceived,
        itemsSold: acc.itemsSold + d.itemsSold,
        totalSales: acc.totalSales + d.totalSales,
        footFall: acc.footFall + d.footFall,
        approached: acc.approached + d.approached,
        converted: acc.converted + d.converted,
      }),
      { itemsReceived: 0, itemsSold: 0, totalSales: 0, footFall: 0, approached: 0, converted: 0 }
    ));

    res.json(ok({ days: dayRows, total }));
  })
);

export default router;
