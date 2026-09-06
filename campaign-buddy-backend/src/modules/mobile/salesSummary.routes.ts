import { Router } from "express";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError, ok } from "../../utils/apiResponse";
import { buildSalesSummary } from "../../utils/salesCalc";

const router = Router();
function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }

async function currentActivationOrThrow(staffId: string) {
  const today = startOfDay(new Date());
  const activation = await prisma.activation.findFirst({
    where: { staffId, dateFrom: { lte: today }, dateTo: { gte: today } },
  });
  if (!activation) throw new ApiError(404, "NOT_FOUND", "No assignment for today");
  return activation;
}

router.get(
  "/sales-summary/today",
  asyncHandler(async (req, res) => {
    const activation = await currentActivationOrThrow(req.staff!.sub);
    const summary = await buildSalesSummary(prisma, activation.id, startOfDay(new Date()));
    res.json(ok(summary));
  })
);

router.patch(
  "/sales-summary/today",
  asyncHandler(async (req, res) => {
    const activation = await currentActivationOrThrow(req.staff!.sub);
    const { remarks } = req.body as { remarks?: string };
    const today = startOfDay(new Date());
    await prisma.salesSummary.upsert({
      where: { activationId_date: { activationId: activation.id, date: today } },
      create: { activationId: activation.id, date: today, remarks },
      update: { remarks },
    });
    const summary = await buildSalesSummary(prisma, activation.id, today);
    res.json(ok(summary));
  })
);

router.post(
  "/sales-summary/today/confirm",
  asyncHandler(async (req, res) => {
    const activation = await currentActivationOrThrow(req.staff!.sub);
    const today = startOfDay(new Date());
    await prisma.salesSummary.upsert({
      where: { activationId_date: { activationId: activation.id, date: today } },
      create: { activationId: activation.id, date: today, confirmed: true, confirmedAt: new Date() },
      update: { confirmed: true, confirmedAt: new Date() }, // idempotent
    });
    const summary = await buildSalesSummary(prisma, activation.id, today);
    res.json(ok(summary));
  })
);

export default router;
