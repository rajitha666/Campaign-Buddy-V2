import { Router } from "express";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ok, notFound } from "../../utils/apiResponse";

const router = Router();

// The mobile app is built to docs/api-spec.md, whose data models
// pre-date the v3 schema's Activation/Staff naming. `/v1/*` is consumed only by
// that app, so these handlers translate the v3 rows into the shapes the app
// expects (User, TodayAssignment, …).

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase();
}

router.get(
  "/me",
  asyncHandler(async (req, res) => {
    const staff = await prisma.staff.findUniqueOrThrow({
      where: { id: req.staff!.sub },
      include: { reportsTo: true },
    });
    res.json(
      ok({
        id: staff.id,
        employeeId: staff.employeeId,
        fullName: staff.fullName,
        displayName: staff.displayName,
        username: staff.mobileUsername,
        phone: staff.phone ?? "",
        role: staff.userType === "supervisor" ? "campaign_owner" : "field_rep",
        avatarInitials: initials(staff.displayName || staff.fullName),
        reportsToUserId: staff.reportsToStaffId,
        reportsToName: staff.reportsTo?.fullName ?? "",
      })
    );
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
    res.json(
      ok({
        assignmentId: activation.id,
        campaign: {
          id: activation.campaign.id,
          name: activation.campaign.name,
          startDate: activation.campaign.startDate,
        },
        outlet: {
          id: activation.outlet.id,
          name: activation.outlet.name,
          address: activation.outlet.address ?? "",
          latitude: activation.outlet.latitude,
          longitude: activation.outlet.longitude,
          geofenceRadiusMeters: activation.outlet.geofenceRadiusMeters,
        },
        shiftStart: activation.shiftStart,
        shiftEnd: activation.shiftEnd,
      })
    );
  })
);

export default router;
