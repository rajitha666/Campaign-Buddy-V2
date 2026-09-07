import { Router } from "express";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ok, notFound } from "../../utils/apiResponse";

const router = Router();

router.get(
  "/campaigns/:campaignId/performance",
  asyncHandler(async (req, res) => {
    const { campaignId } = req.params;
    const { outletId } = req.query as { outletId?: string };

    const activation = await prisma.activation.findFirst({
      where: { staffId: req.staff!.sub, campaignId, ...(outletId ? { outletId } : {}) },
    });
    if (!activation) throw notFound("Your activation on this campaign");

    const [dailyStats, salesRecords] = await Promise.all([
      prisma.dailyStats.findMany({ where: { activationId: activation.id }, orderBy: { date: "asc" } }),
      prisma.salesRecord.findMany({
        where: { activationItem: { activationId: activation.id } },
        include: { activationItem: { include: { campaignItem: { include: { item: true } } } } },
      }),
    ]);

    const daysPassed = Math.max(1, Math.round((Date.now() - activation.dateFrom.getTime()) / 86400000) + 1);
    const totalCampaignDays = Math.round((activation.dateTo.getTime() - activation.dateFrom.getTime()) / 86400000) + 1;

    const byDay: Record<string, number> = {};
    for (const rec of salesRecords) {
      const key = rec.date.toISOString().slice(0, 10);
      byDay[key] = (byDay[key] ?? 0) + rec.soldToday * rec.activationItem.campaignItem.item.unitPrice;
    }
    const dailySales = Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({ date, amount }));

    // docs/api-spec.md §8 — topProducts as { productId, name, unitPrice, unitsSold }.
    const byItem = new Map<string, { productId: string; name: string; unitPrice: number; unitsSold: number }>();
    for (const rec of salesRecords) {
      const item = rec.activationItem.campaignItem.item;
      const cur = byItem.get(item.id) ?? { productId: item.id, name: item.name, unitPrice: item.unitPrice, unitsSold: 0 };
      cur.unitsSold += rec.soldToday;
      byItem.set(item.id, cur);
    }
    const topProducts = [...byItem.values()].sort((a, b) => b.unitsSold - a.unitsSold);

    const totalUnitsSold = salesRecords.reduce((s, r) => s + r.soldToday, 0);
    const totalApproached = dailyStats.reduce((s, d) => s + d.approached, 0);
    const totalSales = Object.values(byDay).reduce((s, v) => s + v, 0);
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });

    res.json(
      ok({
        campaignName: campaign?.name ?? "",
        startDate: activation.dateFrom,
        dayNumber: daysPassed,
        totalDays: totalCampaignDays,
        totalSales,
        totalUnitsSold,
        totalApproached,
        dailySales,
        topProducts,
      })
    );
  })
);

export default router;
