import { Router } from "express";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ok, notFound } from "../../utils/apiResponse";

const router = Router();

// Staff card for the "who is this promoter" popup, opened from any portal screen.
router.get(
  "/staff/:staffId/card",
  asyncHandler(async (req, res) => {
    const staff = await prisma.staff.findUnique({
      where: { id: req.params.staffId },
      include: { city: true },
    });
    if (!staff) throw notFound("Staff not found");
    res.json(ok(staff));
  })
);

export default router;
