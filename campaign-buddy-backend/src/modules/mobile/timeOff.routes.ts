import { Router } from "express";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError, ok } from "../../utils/apiResponse";
import { validate } from "../../middleware/validate";
import { s } from "../../schemas";
import type { LeaveRequest, Staff } from "@prisma/client";

const router = Router();

const inclusiveDays = (from: Date, to: Date) =>
  Math.round((to.getTime() - from.getTime()) / 86400000) + 1;

// CampaignBuddy_API_Spec.md §2.12 — TimeOffRequest carries userId, a derived
// inclusive `days` count, and the denormalised approverName.
function toTimeOffRequest(r: LeaveRequest & { staff: { reportsTo: Staff | null } }) {
  return {
    id: r.id,
    userId: r.staffId,
    fromDate: r.fromDate,
    toDate: r.toDate,
    days: inclusiveDays(r.fromDate, r.toDate),
    reason: r.reason,
    note: r.note,
    status: r.status,
    approverId: r.approverId,
    approverName: r.staff.reportsTo?.fullName ?? "",
    createdAt: r.createdAt,
    decidedAt: r.decidedAt,
  };
}

router.get(
  "/time-off/balance",
  asyncHandler(async (req, res) => {
    const year = new Date().getFullYear();
    const [approved, pendingCount] = await Promise.all([
      prisma.leaveRequest.findMany({
        where: { staffId: req.staff!.sub, status: "approved", fromDate: { gte: new Date(`${year}-01-01`) } },
      }),
      prisma.leaveRequest.count({ where: { staffId: req.staff!.sub, status: "pending" } }),
    ]);
    const takenThisYear = approved.reduce((sum, r) => sum + inclusiveDays(r.fromDate, r.toDate), 0);
    res.json(ok({ pendingCount, takenThisYear }));
  })
);

router.get(
  "/time-off/requests",
  asyncHandler(async (req, res) => {
    const requests = await prisma.leaveRequest.findMany({
      where: { staffId: req.staff!.sub },
      orderBy: { createdAt: "desc" },
      include: { staff: { include: { reportsTo: true } } },
    });
    res.json(ok(requests.map(toTimeOffRequest)));
  })
);

router.post(
  "/time-off/requests",
  validate({ body: s.timeOffCreate }),
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
      include: { staff: { include: { reportsTo: true } } },
    });
    res.status(201).json(ok(toTimeOffRequest(request)));
  })
);

export default router;
