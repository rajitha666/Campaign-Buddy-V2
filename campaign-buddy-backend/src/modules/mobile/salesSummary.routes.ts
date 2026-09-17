import { Router } from "express";
import { dayDate } from "../../utils/dates";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError, ok } from "../../utils/apiResponse";
import { buildSalesSummary } from "../../utils/salesCalc";
import { requireOpenShift } from "../../utils/salesGuards";
import { todaysTarget } from "../../utils/targets";
import { validate } from "../../middleware/validate";
import { s } from "../../schemas";
import {
  activeDefsForCampaign,
  dayValueMap,
  serializeWithValues,
  writeValues,
  assertRequired,
} from "../../utils/salesFieldStore";

const router = Router();

async function currentActivationOrThrow(staffId: string) {
  const today = dayDate();
  const activation = await prisma.activation.findFirst({
    where: { staffId, dateFrom: { lte: today }, dateTo: { gte: today } },
  });
  if (!activation) throw new ApiError(404, "NOT_FOUND", "No assignment for today");
  return activation;
}

// docs/api-spec.md §2.11 — SalesSummary carries id/userId/assignmentId/date
// on top of the computed rollup, plus the campaign's day-scope custom fields (#13).
async function fullSummary(
  activation: { id: string; campaignId: string },
  staffId: string,
  date: Date
) {
  const activationId = activation.id;
  const [rollup, row, dayDefs, target] = await Promise.all([
    buildSalesSummary(prisma, activationId, date),
    prisma.salesSummary.findUnique({ where: { activationId_date: { activationId, date } } }),
    activeDefsForCampaign(activation.campaignId, "day"),
    todaysTarget(activationId, date),
  ]);
  const values = await dayValueMap(activationId, date);
  return {
    id: row?.id ?? `${activationId}:${date.toISOString().slice(0, 10)}`,
    userId: staffId,
    assignmentId: activationId,
    date,
    ...rollup,
    target,
    customFields: serializeWithValues(dayDefs, values),
  };
}

router.get(
  "/sales-summary/today",
  asyncHandler(async (req, res) => {
    const activation = await currentActivationOrThrow(req.staff!.sub);
    res.json(ok(await fullSummary(activation, req.staff!.sub, dayDate())));
  })
);

// A confirmed day locks the promoter out of editing (issue #13 D6). Admin
// corrections go through the admin route, which has no such guard.
async function assertNotConfirmed(activationId: string, date: Date) {
  const row = await prisma.salesSummary.findUnique({ where: { activationId_date: { activationId, date } } });
  if (row?.confirmed) {
    throw new ApiError(409, "SUMMARY_CONFIRMED", "Today's summary is already confirmed — ask your supervisor to make changes");
  }
}

router.patch(
  "/sales-summary/today",
  validate({ body: s.salesSummaryRemarks }),
  asyncHandler(async (req, res) => {
    const activation = await currentActivationOrThrow(req.staff!.sub);
    await requireOpenShift(activation); // #51 — sales edits need an open shift
    const { remarks, customFields } = req.body as { remarks?: string; customFields?: Record<string, unknown> };
    const today = dayDate();
    await assertNotConfirmed(activation.id, today);

    const dayDefs = await activeDefsForCampaign(activation.campaignId, "day");
    await prisma.$transaction(async (tx) => {
      await tx.salesSummary.upsert({
        where: { activationId_date: { activationId: activation.id, date: today } },
        create: { activationId: activation.id, date: today, remarks },
        update: remarks !== undefined ? { remarks } : {},
      });
      if (customFields) {
        await writeValues(tx, { activationId: activation.id, activationItemId: null, date: today }, dayDefs, customFields);
      }
    });
    res.json(ok(await fullSummary(activation, req.staff!.sub, today)));
  })
);

router.post(
  "/sales-summary/today/confirm",
  validate({ body: s.salesSummaryConfirm }),
  asyncHandler(async (req, res) => {
    const activation = await currentActivationOrThrow(req.staff!.sub);
    await requireOpenShift(activation); // #51 — sales edits need an open shift
    const today = dayDate();
    const { remarks, customFields } = req.body as { remarks?: string; customFields?: Record<string, unknown> };

    const dayDefs = await activeDefsForCampaign(activation.campaignId, "day");
    const existing = await dayValueMap(activation.id, today);
    assertRequired(dayDefs, existing, customFields ?? {});

    await prisma.$transaction(async (tx) => {
      if (customFields) {
        await writeValues(tx, { activationId: activation.id, activationItemId: null, date: today }, dayDefs, customFields);
      }
      await tx.salesSummary.upsert({
        where: { activationId_date: { activationId: activation.id, date: today } },
        create: { activationId: activation.id, date: today, remarks, confirmed: true, confirmedAt: new Date() },
        update: { ...(remarks !== undefined ? { remarks } : {}), confirmed: true, confirmedAt: new Date() }, // idempotent
      });
    });
    res.json(ok(await fullSummary(activation, req.staff!.sub, today)));
  })
);

export default router;
