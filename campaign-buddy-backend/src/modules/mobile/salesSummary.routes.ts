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

// CampaignBuddy_API_Spec.md §2.11 — SalesSummary carries id/userId/assignmentId/date
// on top of the computed rollup.
async function fullSummary(activationId: string, staffId: string, date: Date) {
  const [rollup, row] = await Promise.all([
    buildSalesSummary(prisma, activationId, date),
    prisma.salesSummary.findUnique({ where: { activationId_date: { activationId, date } } }),
  ]);
  return {
    id: row?.id ?? `${activationId}:${date.toISOString().slice(0, 10)}`,
    userId: staffId,
    assignmentId: activationId,
    date,
    ...rollup,
  };
}

router.get(
  "/sales-summary/today",
  asyncHandler(async (req, res) => {
    const activation = await currentActivationOrThrow(req.staff!.sub);
    res.json(ok(await fullSummary(activation.id, req.staff!.sub, startOfDay(new Date()))));
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
    res.json(ok(await fullSummary(activation.id, req.staff!.sub, today)));
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
    res.json(ok(await fullSummary(activation.id, req.staff!.sub, today)));
  })
);

export default router;
