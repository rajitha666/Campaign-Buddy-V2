import { Router } from "express";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError, ok } from "../../utils/apiResponse";
import { computeTotalSales } from "../../utils/salesCalc";
import { validate } from "../../middleware/validate";
import { s } from "../../schemas";

const router = Router();
function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }

// CampaignBuddy_API_Spec.md §2.7 / §6.1 — DailyStats with the derived conversionRate.
function toDailyStats(s: { footFall: number; approached: number; converted: number }, totalSales: number) {
  return {
    footFall: s.footFall,
    approached: s.approached,
    converted: s.converted,
    conversionRate: s.approached > 0 ? s.converted / s.approached : 0,
    totalSales,
  };
}

async function currentActivationOrThrow(staffId: string) {
  const today = startOfDay(new Date());
  const activation = await prisma.activation.findFirst({
    where: { staffId, dateFrom: { lte: today }, dateTo: { gte: today } },
  });
  if (!activation) throw new ApiError(404, "NOT_FOUND", "No assignment for today");
  return activation;
}

router.get(
  "/stats/today",
  asyncHandler(async (req, res) => {
    const activation = await currentActivationOrThrow(req.staff!.sub);
    const today = startOfDay(new Date());
    const stats = await prisma.dailyStats.findUnique({
      where: { activationId_date: { activationId: activation.id, date: today } },
    });
    const totalSales = await computeTotalSales(prisma, activation.id, today); // always computed, never stored (§5.2)
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
    const activation = await currentActivationOrThrow(req.staff!.sub);
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

export default router;
