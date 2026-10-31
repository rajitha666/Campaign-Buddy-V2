import { Router } from "express";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ok } from "../../utils/apiResponse";
import { requireCampaignAccess } from "../../middleware/campaignAccess";

const router = Router();

// Outlet list for the portal export button: every outlet with its city.
router.get(
  "/campaigns/:campaignId/outlet-export",
  requireCampaignAccess,
  asyncHandler(async (_req, res) => {
    const outlets = await prisma.outlet.findMany({
      include: { city: true },
      orderBy: { name: "asc" },
    });
    res.json(ok(outlets));
  })
);

export default router;
