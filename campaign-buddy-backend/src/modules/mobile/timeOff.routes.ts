import { Router } from "express";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError, ok } from "../../utils/apiResponse";

const router = Router();

router.get(
  "/time-off/balance",
  asyncHandler(async (req, res) => {
    const year = new Date().getFullYear();
    const taken = await prisma.leaveRequest.findMany({
      where: { staffId: req.staff!.sub, status: "approved", fromDate: { gte: new Date(`${year}-01-01`) } },
    });
    const daysTaken = taken.reduce(
      (sum, r) => sum + Math.round((r.toDate.getTime() - r.fromDate.getTime()) / 86400000) + 1,
      0
    );
    res.json(ok({ takenThisYear: daysTaken }));
  })
);

router.get(
  "/time-off/requests",
  asyncHandler(async (req, res) => {
    const requests = await prisma.leaveRequest.findMany({
      where: { staffId: req.staff!.sub },
      orderBy: { createdAt: "desc" },
    });
    res.json(ok(requests));
  })
);

router.post(
  "/time-off/requests",
  asyncHandler(async (req, res) => {
    const { fromDate, toDate, reason, note } = req.body as {
      fromDate: string; toDate: string; reason: "sick_leave" | "annual_leave" | "personal" | "other"; note?: string;
    };
    const from = new Date(fromDate);
    const to = new Date(toDate);

    const overlap = await prisma.leaveRequest.findFirst({
      where: {
        staffId: req.staff!.sub,
        status: { in: ["pending", "approved"] },
        fromDate: { lte: to },
        toDate: { gte: from },
      },
    });
    if (overlap) throw new ApiError(409, "OVERLAPPING_LEAVE_REQUEST", "You already have a leave request in this range");

    const staff = await prisma.staff.findUniqueOrThrow({ where: { id: req.staff!.sub } });
    const request = await prisma.leaveRequest.create({
      data: { staffId: req.staff!.sub, fromDate: from, toDate: to, reason, note, approverId: staff.reportsToStaffId },
    });
    res.status(201).json(ok(request));
  })
);

export default router;
