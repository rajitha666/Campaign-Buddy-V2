import { Router } from "express";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError, ok } from "../../utils/apiResponse";
import { computeTotalSales } from "../../utils/salesCalc";
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

export default router;
