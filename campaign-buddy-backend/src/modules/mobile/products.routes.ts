import { Router } from "express";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError, ok, notFound, validationError } from "../../utils/apiResponse";

const router = Router();
function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }

router.get(
  "/campaigns/:campaignId/outlets/:outletId/products",
  asyncHandler(async (req, res) => {
    const { campaignId, outletId } = req.params;
    const reorderOnly = req.query.reorderOnly === "true";
    const today = startOfDay(new Date());

    const activation = await prisma.activation.findFirst({
      where: { staffId: req.staff!.sub, campaignId, outletId, dateFrom: { lte: today }, dateTo: { gte: today } },
    });
    if (!activation) throw notFound("Your assignment at this outlet");

    const activationItems = await prisma.activationItem.findMany({
      where: { activationId: activation.id },
      include: { campaignItem: { include: { item: true } }, salesRecords: { where: { date: today } } },
    });

    const rows = activationItems
      .map((ai) => {
        const rec = ai.salesRecords[0];
        return {
          activationItemId: ai.id,
          itemId: ai.campaignItem.item.id,
          name: ai.campaignItem.item.name,
          imageUrl: ai.campaignItem.item.imageUrl,
          unitPrice: ai.campaignItem.item.unitPrice,
          availableQty: (rec?.openingStock ?? 0) - (rec?.soldToday ?? 0),
          soldQty: rec?.soldToday ?? 0,
          reorderFlag: rec?.reorderFlag ?? false,
        };
      })
      .filter((r) => !reorderOnly || r.reorderFlag);

    res.json(ok(rows));
  })
);

router.get(
  "/products/:productId",
  asyncHandler(async (req, res) => {
    const item = await prisma.item.findUnique({
      where: { id: req.params.productId },
      include: { brand: true },
    });
    if (!item) throw notFound("Product");

    const today = startOfDay(new Date());
    const activationItems = await prisma.activationItem.findMany({
      where: { campaignItem: { itemId: item.id } },
      include: { salesRecords: { where: { date: today } }, campaignItem: true },
    });
    const soldAcrossAllOutletsToday = activationItems.reduce((sum, ai) => sum + (ai.salesRecords[0]?.soldToday ?? 0), 0);
    const addedToCampaignAt = activationItems.length
      ? activationItems.map((ai) => ai.campaignItem.addedAt).sort((a, b) => a.getTime() - b.getTime())[0]
      : null;

    res.json(ok({ ...item, brandName: item.brand.name, soldAcrossAllOutletsToday, addedToCampaignAt }));
  })
);

router.patch(
  "/products/:campaignProductAssignmentId/stock",
  asyncHandler(async (req, res) => {
    // :campaignProductAssignmentId = ActivationItem.id (Spec v3 §4.1 naming note)
    const activationItemId = req.params.campaignProductAssignmentId;
    const { openingStock, soldToday, otherInterestedCustomers, reorderFlag } = req.body as {
      openingStock?: number; soldToday?: number; otherInterestedCustomers?: number; reorderFlag?: boolean;
    };
    const today = startOfDay(new Date());

    const activationItem = await prisma.activationItem.findUnique({ where: { id: activationItemId } });
    if (!activationItem) throw notFound("Activation product");

    const existing = await prisma.salesRecord.findUnique({
      where: { activationItemId_date: { activationItemId, date: today } },
    });
    const effectiveOpeningStock = openingStock ?? existing?.openingStock ?? 0;
    const effectiveSoldToday = soldToday ?? existing?.soldToday ?? 0;
    if (effectiveSoldToday > effectiveOpeningStock) {
      throw validationError("soldToday cannot exceed openingStock", "soldToday");
    }

    const record = await prisma.salesRecord.upsert({
      where: { activationItemId_date: { activationItemId, date: today } },
      create: {
        activationItemId, date: today,
        openingStock: effectiveOpeningStock, soldToday: effectiveSoldToday,
        otherInterestedCustomers: otherInterestedCustomers ?? 0, reorderFlag: reorderFlag ?? false,
      },
      update: {
        ...(openingStock != null ? { openingStock } : {}),
        ...(soldToday != null ? { soldToday } : {}),
        ...(otherInterestedCustomers != null ? { otherInterestedCustomers } : {}),
        ...(reorderFlag != null ? { reorderFlag } : {}),
      },
    });
    res.json(ok(record));
  })
);

export default router;
