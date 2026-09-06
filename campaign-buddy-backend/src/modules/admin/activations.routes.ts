import { Router } from "express";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ok, okList, notFound, ApiError } from "../../utils/apiResponse";
import { requireRole } from "../../middleware/userAuth";
import { requireCampaignAccess, outletIdsAllowed, assertOutletAllowed } from "../../middleware/campaignAccess";
import { coerceDates } from "../../utils/coerce";

const router = Router();

const ACTIVATION_WRITABLE = [
  "name", "outletId", "staffId", "supervisorStaffId", "distributorPointId",
  "dateFrom", "dateTo", "targetType", "targetCategorization", "targetUnit",
  "shiftStart", "shiftEnd",
] as const;

function pickActivation(body: Record<string, unknown>) {
  const picked: Record<string, unknown> = {};
  for (const key of ACTIVATION_WRITABLE) if (body[key] !== undefined) picked[key] = body[key];
  return coerceDates(picked, ["dateFrom", "dateTo", "shiftStart", "shiftEnd"]);
}

// Confirmed v3 (§5.3): setting supervisorStaffId auto-provisions/expands that
// supervisor's portal access — always additive, always "subset" seeded with just
// this one outlet, never "all" by default.
async function autoGrantSupervisor(supervisorStaffId: string | null | undefined, campaignId: string, outletId: string) {
  if (!supervisorStaffId) return;
  const supervisor = await prisma.staff.findUnique({ where: { id: supervisorStaffId } });
  if (!supervisor?.linkedUserId) return; // no portal login — nothing to grant

  const existing = await prisma.campaignAccessGrant.findUnique({
    where: { userId_campaignId: { userId: supervisor.linkedUserId, campaignId } },
  });

  if (!existing) {
    await prisma.campaignAccessGrant.create({
      data: { userId: supervisor.linkedUserId, campaignId, scopeType: "subset", outletIds: [outletId] },
    });
  } else if (existing.scopeType === "subset" && !existing.outletIds.includes(outletId)) {
    await prisma.campaignAccessGrant.update({
      where: { id: existing.id },
      data: { outletIds: [...existing.outletIds, outletId] },
    });
  }
  // scopeType === "all" → leave untouched
}

router.get(
  "/campaigns/:campaignId/activations",
  requireCampaignAccess,
  asyncHandler(async (req, res) => {
    const allowedOutlets = outletIdsAllowed(req);
    const rows = await prisma.activation.findMany({
      where: { campaignId: req.params.campaignId, ...(allowedOutlets ? { outletId: { in: allowedOutlets } } : {}) },
      include: { outlet: true, staff: true, supervisor: true },
    });
    res.json(okList(rows, rows.length));
  })
);

router.post(
  "/campaigns/:campaignId/activations",
  requireCampaignAccess,
  requireRole("adm", "usr"),
  asyncHandler(async (req, res) => {
    assertOutletAllowed(req, req.body.outletId);
    const created = await prisma.activation.create({
      data: { ...pickActivation(req.body), campaignId: req.params.campaignId } as any,
    });
    await autoGrantSupervisor(created.supervisorStaffId, req.params.campaignId, created.outletId);
    res.status(201).json(ok(created));
  })
);

router.get(
  "/campaigns/:campaignId/activations/:activationId",
  requireCampaignAccess,
  asyncHandler(async (req, res) => {
    const activation = await prisma.activation.findUnique({
      where: { id: req.params.activationId },
      include: { outlet: true, staff: true, supervisor: true, activationItems: true },
    });
    if (!activation) throw notFound("Activation");
    assertOutletAllowed(req, activation.outletId);
    res.json(ok(activation));
  })
);

router.patch(
  "/campaigns/:campaignId/activations/:activationId",
  requireCampaignAccess,
  requireRole("adm", "usr"),
  asyncHandler(async (req, res) => {
    if (req.body.outletId) assertOutletAllowed(req, req.body.outletId);
    const updated = await prisma.activation.update({
      where: { id: req.params.activationId },
      data: pickActivation(req.body),
    });
    await autoGrantSupervisor(updated.supervisorStaffId, req.params.campaignId, updated.outletId);
    res.json(ok(updated));
  })
);

router.delete(
  "/campaigns/:campaignId/activations/:activationId",
  requireCampaignAccess,
  requireRole("adm", "usr"),
  asyncHandler(async (req, res) => {
    await prisma.activation.delete({ where: { id: req.params.activationId } });
    res.status(204).send();
  })
);

router.get(
  "/campaigns/:campaignId/activations/:activationId/items",
  requireCampaignAccess,
  asyncHandler(async (req, res) => {
    const activation = await prisma.activation.findUniqueOrThrow({ where: { id: req.params.activationId } });
    assertOutletAllowed(req, activation.outletId);
    const rows = await prisma.activationItem.findMany({
      where: { activationId: req.params.activationId },
      include: { campaignItem: { include: { item: true } } },
    });
    res.json(okList(rows, rows.length));
  })
);

router.post(
  "/campaigns/:campaignId/activations/:activationId/items",
  requireCampaignAccess,
  requireRole("adm", "usr"),
  asyncHandler(async (req, res) => {
    const body = req.body as { campaignItemId?: string; campaignItemIds?: string[]; addAll?: boolean };
    const activationId = req.params.activationId;

    // Resolve the set of campaignItemIds to attach, from any of the accepted shapes.
    let ids: string[];
    if (body.addAll) {
      ids = (await prisma.campaignItem.findMany({ where: { campaignId: req.params.campaignId }, select: { id: true } })).map((c) => c.id);
    } else if (Array.isArray(body.campaignItemIds)) {
      ids = body.campaignItemIds;
    } else if (body.campaignItemId) {
      ids = [body.campaignItemId];
    } else {
      throw new ApiError(400, "VALIDATION_ERROR", "campaignItemId, campaignItemIds or addAll is required");
    }

    // Idempotent — re-attaching an already-linked item is a no-op, not a 409.
    const created = await prisma.$transaction(
      ids.map((campaignItemId) =>
        prisma.activationItem.upsert({
          where: { activationId_campaignItemId: { activationId, campaignItemId } },
          create: { activationId, campaignItemId },
          update: {},
        })
      )
    );
    res.status(201).json(okList(created, created.length));
  })
);

router.delete(
  "/campaigns/:campaignId/activations/:activationId/items/:activationItemId",
  requireCampaignAccess,
  requireRole("adm", "usr"),
  asyncHandler(async (req, res) => {
    await prisma.activationItem.delete({ where: { id: req.params.activationItemId } });
    res.status(204).send();
  })
);

router.get(
  "/campaigns/:campaignId/activations/:activationId/targets",
  requireCampaignAccess,
  asyncHandler(async (req, res) => {
    const activation = await prisma.activation.findUniqueOrThrow({ where: { id: req.params.activationId } });
    assertOutletAllowed(req, activation.outletId);
    const rows = await prisma.activationTarget.findMany({ where: { activationId: req.params.activationId } });
    res.json(okList(rows, rows.length));
  })
);

router.post(
  "/campaigns/:campaignId/activations/:activationId/targets",
  requireCampaignAccess,
  requireRole("adm", "usr"),
  asyncHandler(async (req, res) => {
    const { dateFrom, dateTo, repeat, targetItemId, targetValue } = req.body as Record<string, unknown>;
    const created = await prisma.activationTarget.create({
      data: {
        activationId: req.params.activationId,
        dateFrom: new Date(dateFrom as string),
        dateTo: new Date(dateTo as string),
        repeat: !!repeat,
        targetItemId: targetItemId as string,
        targetValue: Number(targetValue) || 0,
      },
    });
    res.status(201).json(ok(created));
  })
);

export default router;
