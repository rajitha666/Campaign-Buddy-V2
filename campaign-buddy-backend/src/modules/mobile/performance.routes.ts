import { Router } from "express";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ok } from "../../utils/apiResponse";
import { workingDaysBetween } from "../../utils/salesGuards";
import { countActivationWorkingDays } from "../../utils/activationPerformance";
import { todaysTarget, totalTargetFromDaily } from "../../utils/targets";

const router = Router();

router.get(
  "/campaigns/:campaignId/performance",
  asyncHandler(async (req, res) => {
    const { campaignId } = req.params;
    const { outletId } = req.query as { outletId?: string };

    const activation = await prisma.activation.findFirst({
      where: { staffId: req.staff!.sub, campaignId, deletedAt: null, ...(outletId ? { outletId } : {}) },
    });
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });

    if (!activation) {
      res.json(
        ok({
          campaignName: campaign?.name ?? "",
          startDate: null,
          dayNumber: 0,
          totalDays: 0,
          totalSales: 0,
          totalUnitsSold: 0,
          totalApproached: 0,
          totalTarget: null,
          dailySales: [],
          topProducts: [],
        })
      );
      return;
    }

    const [dailyStats, salesRecords] = await Promise.all([
      prisma.dailyStats.findMany({ where: { activationId: activation.id }, orderBy: { date: "asc" } }),
      prisma.salesRecord.findMany({
        where: { activationItem: { activationId: activation.id } },
        include: { activationItem: { include: { campaignItem: { include: { item: true } } } } },
      }),
    ]);

    // Issue #53 — "Day X of Y" counts working days (outlets closed on weekends);
    // client doc B — which days count as "working" depends on activation type
    // (weekend activations run Sat/Sun, so #53's Mon-Fri-only helper would
    // undercount almost every day for them).
    const todayEnd = Date.now() < activation.dateTo.getTime() ? new Date() : activation.dateTo;
    const daysPassed = activation.activationType === "weekend"
      ? Math.max(countActivationWorkingDays(activation.dateFrom, todayEnd, "weekend"), 1)
      : workingDaysBetween(activation.dateFrom, todayEnd);
    const totalCampaignDays = activation.activationType === "weekend"
      ? Math.max(countActivationWorkingDays(activation.dateFrom, activation.dateTo, "weekend"), 1)
      : workingDaysBetween(activation.dateFrom, activation.dateTo);

    const byDay: Record<string, number> = {};
    for (const rec of salesRecords) {
      const key = rec.date.toISOString().slice(0, 10);
      byDay[key] = (byDay[key] ?? 0) + rec.soldToday * rec.activationItem.campaignItem.item.unitPrice;
    }
    const dailySales = Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({ date, amount }));

    const byItem = new Map<string, { productId: string; name: string; unitPrice: number; imageUrl: string | null; unitsSold: number }>();
    for (const rec of salesRecords) {
      const item = rec.activationItem.campaignItem.item;
      const cur = byItem.get(item.id) ?? { productId: item.id, name: item.name, unitPrice: item.unitPrice, imageUrl: item.imageUrl, unitsSold: 0 };
      cur.unitsSold += rec.soldToday;
      byItem.set(item.id, cur);
    }
    const topProducts = [...byItem.values()].sort((a, b) => b.unitsSold - a.unitsSold);

    const totalUnitsSold = salesRecords.reduce((s, r) => s + r.soldToday, 0);
    const totalApproached = dailyStats.reduce((s, d) => s + d.approached, 0);
    const totalSales = Object.values(byDay).reduce((s, v) => s + v, 0);

    // "Total target" projects today's active target across the whole
    // activation run — see utils/targets.ts.
    const dailyTarget = await todaysTarget(activation.id);
    const totalTarget = totalTargetFromDaily(dailyTarget, activation.dateFrom, activation.dateTo);

    res.json(
      ok({
        campaignName: campaign?.name ?? "",
        startDate: activation.dateFrom,
        dayNumber: daysPassed,
        totalDays: totalCampaignDays,
        totalSales,
        totalUnitsSold,
        totalApproached,
        totalTarget,
        dailySales,
        topProducts,
      })
    );
  })
);

export default router;
