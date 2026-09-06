import { Router } from "express";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ok, okList, notFound } from "../../utils/apiResponse";
import { requireRole } from "../../middleware/userAuth";
import { requireCampaignAccess } from "../../middleware/campaignAccess";
import { computeCampaignStatus } from "../../utils/campaignStatus";
import { coerceDates } from "../../utils/coerce";
import { validate } from "../../middleware/validate";
import { s } from "../../schemas";

const router = Router();

// GET /campaigns doubles as the portal's campaign switcher — filtered to the
// caller's grants (or every campaign, for adm). Spec v3 §4.2.
router.get(
  "/campaigns",
  asyncHandler(async (req, res) => {
    const where =
      req.user!.roleId === "adm"
        ? {}
        : { accessGrants: { some: { userId: req.user!.sub } } };
    const campaigns = await prisma.campaign.findMany({ where, include: { client: true } });

    // Auto-sync status on read (§5.8) — skip campaigns with a manual override,
    // only persist when the date-derived value actually changed.
    const synced = await Promise.all(
      campaigns.map(async (c) => {
        if (c.statusManuallySet) return c;
        const computed = computeCampaignStatus(c.startDate, c.endDate);
        if (computed !== c.status) {
          return prisma.campaign.update({
            where: { id: c.id },
            data: { status: computed },
            include: { client: true },
          });
        }
        return c;
      })
    );
    res.json(okList(synced, synced.length));
  })
);

router.post(
  "/campaigns",
  requireRole("adm", "usr"),
  validate({ body: s.campaignCreate }),
  asyncHandler(async (req, res) => {
    const created = await prisma.campaign.create({ data: coerceDates(req.body, ["startDate", "endDate"]) });
    // Creator automatically gets an "all"-scope grant (Spec v3 §4.2)
    await prisma.campaignAccessGrant.create({
      data: { userId: req.user!.sub, campaignId: created.id, scopeType: "all", outletIds: [] },
    });
    res.status(201).json(ok(created));
  })
);

router.get(
  "/campaigns/:campaignId",
  requireCampaignAccess,
  asyncHandler(async (req, res) => {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.campaignId }, include: { client: true } });
    if (!campaign) throw notFound("Campaign");
    const computed = computeCampaignStatus(campaign.startDate, campaign.endDate);
    const synced =
      !campaign.statusManuallySet && computed !== campaign.status
        ? await prisma.campaign.update({ where: { id: campaign.id }, data: { status: computed }, include: { client: true } })
        : campaign;
    res.json(ok(synced));
  })
);

router.patch(
  "/campaigns/:campaignId",
  requireCampaignAccess,
  requireRole("adm", "usr"),
  validate({ body: s.campaignUpdate }),
  asyncHandler(async (req, res) => {
    // A manual `status` in the body is a deliberate override (§5.8) — it sticks
    // until the dates change, at which point the date-derived rule resumes.
    const body = req.body as Record<string, unknown>;
    const data: Record<string, unknown> = coerceDates(body, ["startDate", "endDate"]);
    if (body.status !== undefined) {
      data.statusManuallySet = true;
    } else if (body.startDate !== undefined || body.endDate !== undefined) {
      data.statusManuallySet = false;
    }
    const updated = await prisma.campaign.update({ where: { id: req.params.campaignId }, data });
    res.json(ok(updated));
  })
);

router.delete(
  "/campaigns/:campaignId",
  requireCampaignAccess,
  requireRole("adm"),
  asyncHandler(async (req, res) => {
    await prisma.campaign.delete({ where: { id: req.params.campaignId } });
    res.status(204).send();
  })
);

router.get(
  "/campaigns/:campaignId/items",
  requireCampaignAccess,
  asyncHandler(async (req, res) => {
    const rows = await prisma.campaignItem.findMany({ where: { campaignId: req.params.campaignId }, include: { item: true } });
    res.json(okList(rows, rows.length));
  })
);

router.post(
  "/campaigns/:campaignId/items",
  requireCampaignAccess,
  requireRole("adm", "usr"),
  validate({ body: s.campaignItemAdd }),
  asyncHandler(async (req, res) => {
    const { itemId, newItem } = req.body as { itemId?: string; newItem?: any };
    const resolvedItemId = itemId ?? (await prisma.item.create({ data: newItem })).id;
    const created = await prisma.campaignItem.create({
      data: { campaignId: req.params.campaignId, itemId: resolvedItemId },
    });
    res.status(201).json(ok(created));
  })
);

router.delete(
  "/campaigns/:campaignId/items/:campaignItemId",
  requireCampaignAccess,
  requireRole("adm", "usr"),
  asyncHandler(async (req, res) => {
    await prisma.campaignItem.delete({ where: { id: req.params.campaignItemId } });
    res.status(204).send();
  })
);

router.get(
  "/campaigns/:campaignId/access",
  requireCampaignAccess,
  requireRole("adm", "usr"),
  asyncHandler(async (req, res) => {
    const grants = await prisma.campaignAccessGrant.findMany({
      where: { campaignId: req.params.campaignId },
      include: { user: { include: { role: true } } },
    });
    res.json(okList(grants, grants.length));
  })
);

export default router;
