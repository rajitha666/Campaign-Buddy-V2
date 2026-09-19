import { Router } from "express";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ok, okList, notFound, ApiError } from "../../utils/apiResponse";
import { requireRole } from "../../middleware/userAuth";
import { requireCampaignAccess, outletIdsAllowed, assertOutletAllowed } from "../../middleware/campaignAccess";
import { coerceDates } from "../../utils/coerce";
import { validate } from "../../middleware/validate";
import { s } from "../../schemas";
import { computeTargetProgress } from "./targetProgress";

const router = Router();

const ACTIVATION_WRITABLE = [
  "name", "outletId", "staffId", "supervisorStaffId", "distributorPointId",
  "dateFrom", "dateTo", "targetType", "targetCategorization", "targetUnit", "activationType",
  "shiftStartMinutes", "shiftEndMinutes",
] as const;

function pickActivation(body: Record<string, unknown>) {
  const picked: Record<string, unknown> = {};
  for (const key of ACTIVATION_WRITABLE) if (body[key] !== undefined) picked[key] = body[key];
  return coerceDates(picked, ["dateFrom", "dateTo"]);
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
      where: {
        campaignId: req.params.campaignId,
        deletedAt: null,
        ...(allowedOutlets ? { outletId: { in: allowedOutlets } } : {}),
      },
      include: { outlet: true, staff: true, supervisor: true },
    });
    res.json(okList(rows, rows.length));
  })
);

router.post(
  "/campaigns/:campaignId/activations",
  requireCampaignAccess,
  requireRole("adm", "usr"),
  validate({ body: s.activationCreate }),
  asyncHandler(async (req, res) => {
    assertOutletAllowed(req, req.body.outletId);
    const created = await prisma.$transaction(async (tx) => {
      const activation = await tx.activation.create({
        data: { ...pickActivation(req.body), campaignId: req.params.campaignId } as any,
      });
      // #43 — default to the campaign's full item list. Portal activations used
      // to start with zero ActivationItems and the promoter's Products screen
      // was empty until every row was hand-created; the Activation Items screen
      // still trims this default down to the actual subset.
      const campaignItems = await tx.campaignItem.findMany({ where: { campaignId: req.params.campaignId }, select: { id: true } });
      if (campaignItems.length) {
        await tx.activationItem.createMany({
          data: campaignItems.map((ci) => ({ activationId: activation.id, campaignItemId: ci.id })),
          skipDuplicates: true,
        });
      }
      return activation;
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
    if (!activation || activation.deletedAt) throw notFound("Activation");
    assertOutletAllowed(req, activation.outletId);
    res.json(ok(activation));
  })
);

router.patch(
  "/campaigns/:campaignId/activations/:activationId",
  requireCampaignAccess,
  requireRole("adm", "usr"),
  validate({ body: s.activationUpdate }),
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
    const outletIds = outletIdsAllowed(req);
    const existing = await prisma.activation.findUnique({ where: { id: req.params.activationId } });
    if (!existing || existing.deletedAt || existing.campaignId !== req.params.campaignId) throw notFound("Activation");
    if (outletIds) assertOutletAllowed(req, existing.outletId);
    await prisma.activation.update({ where: { id: req.params.activationId }, data: { deletedAt: new Date() } });
    res.json(ok({ ...existing, deletedAt: new Date(), softDeleted: true }));
  })
);

router.get(
  "/campaigns/:campaignId/activations/:activationId/items",
  requireCampaignAccess,
  asyncHandler(async (req, res) => {
    const activation = await prisma.activation.findUnique({ where: { id: req.params.activationId } });
    if (!activation || activation.deletedAt) throw notFound("Activation");
    assertOutletAllowed(req, activation.outletId);
    const rows = await prisma.activationItem.findMany({
      where: { activationId: req.params.activationId, campaignItem: { item: { deletedAt: null } } },
      include: { campaignItem: { include: { item: { include: { brand: true } } } } },
    });
    res.json(okList(rows, rows.length));
  })
);

router.post(
  "/campaigns/:campaignId/activations/:activationId/items",
  requireCampaignAccess,
  requireRole("adm", "usr"),
  validate({ body: s.activationItemsAdd }),
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
    const activation = await prisma.activation.findUnique({ where: { id: req.params.activationId } });
    if (!activation || activation.deletedAt) throw notFound("Activation");
    assertOutletAllowed(req, activation.outletId);
    const rows = await prisma.activationTarget.findMany({ where: { activationId: req.params.activationId } });
    const withProgress = await Promise.all(
      rows.map(async (row) => ({ ...row, ...(await computeTargetProgress(row, activation.targetUnit)) }))
    );
    res.json(okList(withProgress, withProgress.length));
  })
);

router.post(
  "/campaigns/:campaignId/activations/:activationId/targets",
  requireCampaignAccess,
  requireRole("adm", "usr"),
  validate({ body: s.targetCreate }),
  asyncHandler(async (req, res) => {
    const activation = await prisma.activation.findUnique({ where: { id: req.params.activationId } });
    if (!activation || activation.deletedAt) throw notFound("Activation");
    assertOutletAllowed(req, activation.outletId);

    const { dateFrom, dateTo, repeat, targetItemId, targetBrandId, targetValue } = req.body as Record<string, unknown>;

    if (activation.targetType === "brand_wise" && !targetBrandId) {
      throw new ApiError(400, "VALIDATION_ERROR", "This activation is Brand Wise — targetBrandId is required");
    }
    if (activation.targetType === "item_wise" && !targetItemId) {
      throw new ApiError(400, "VALIDATION_ERROR", "This activation is Item Wise — targetItemId is required");
    }

    if (targetBrandId) {
      const brandOnActivation = await prisma.activationItem.findFirst({
        where: { activationId: req.params.activationId, campaignItem: { item: { brandId: targetBrandId as string } } },
      });
      if (!brandOnActivation) {
        throw new ApiError(400, "VALIDATION_ERROR", "targetBrandId has no items on this activation");
      }
    }

    const created = await prisma.activationTarget.create({
      data: {
        activationId: req.params.activationId,
        dateFrom: new Date(dateFrom as string),
        dateTo: new Date(dateTo as string),
        repeat: !!repeat,
        targetItemId: (targetItemId as string) ?? null,
        targetBrandId: (targetBrandId as string) ?? null,
        targetValue: Number(targetValue) || 0,
      },
    });
    res.status(201).json(ok({ ...created, ...(await computeTargetProgress(created, activation.targetUnit)) }));
  })
);

export default router;
