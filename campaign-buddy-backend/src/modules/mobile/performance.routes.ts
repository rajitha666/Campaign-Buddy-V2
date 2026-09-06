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

    const [attendance, dailyStats, salesRecords] = await Promise.all([
      prisma.attendanceRecord.findMany({ where: { activationId: activation.id } }),
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

    const byItem: Record<string, number> = {};
    for (const rec of salesRecords) {
      const name = rec.activationItem.campaignItem.item.name;
      byItem[name] = (byItem[name] ?? 0) + rec.soldToday;
    }
    const topProducts = Object.entries(byItem).sort((a, b) => b[1] - a[1]).map(([name, unitsSold]) => ({ name, unitsSold }));

    const totalUnitsSold = salesRecords.reduce((s, r) => s + r.soldToday, 0);
    const totalApproached = dailyStats.reduce((s, d) => s + d.approached, 0);
    const totalSales = Object.values(byDay).reduce((s, v) => s + v, 0);

    res.json(
      ok({
        campaignName: (await prisma.campaign.findUnique({ where: { id: campaignId } }))?.name,
        startDate: activation.dateFrom,
        dayLabel: `Day ${daysPassed} of ${totalCampaignDays}`,
        totalSales,
        totalUnitsSold,
        totalApproached,
        byDay,
        topProducts,
        attendanceDaysPresent: attendance.filter((a) => a.status === "on_time" || a.status === "late").length,
      })
    );
  })
);

export default router;
