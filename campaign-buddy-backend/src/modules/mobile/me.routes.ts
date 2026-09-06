import { Router } from "express";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ok, notFound } from "../../utils/apiResponse";

const router = Router();

router.get(
  "/me",
  asyncHandler(async (req, res) => {
    const staff = await prisma.staff.findUniqueOrThrow({ where: { id: req.staff!.sub } });
    res.json(ok(staff)); // passwordHash omitted globally (src/utils/prisma.ts)
  })
);

router.get(
  "/me/assignments/today",
  asyncHandler(async (req, res) => {
    const today = new Date();
    const activation = await prisma.activation.findFirst({
      where: { staffId: req.staff!.sub, dateFrom: { lte: today }, dateTo: { gte: today } },
      include: { campaign: true, outlet: true },
    });
    if (!activation) throw notFound("An assignment for today");
    res.json(ok(activation));
  })
);

export default router;
