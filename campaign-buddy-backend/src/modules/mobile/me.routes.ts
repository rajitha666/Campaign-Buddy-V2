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

// A supervisor can have several concurrent outlet Activations (one per outlet
// on their route) unlike a promoter's single daily assignment, so this returns
// a list rather than `/me/assignments/today`'s single object. That endpoint is
// left untouched so the promoter flow doesn't change.
router.get(
  "/me/assignments",
  asyncHandler(async (req, res) => {
    const dateParam = typeof req.query.date === "string" ? new Date(req.query.date) : new Date();
    const date = Number.isNaN(dateParam.getTime()) ? new Date() : dateParam;
    const activations = await prisma.activation.findMany({
      where: { staffId: req.staff!.sub, dateFrom: { lte: date }, dateTo: { gte: date } },
      include: { campaign: true, outlet: true },
    });
    activations.sort((a, b) => a.outlet.name.localeCompare(b.outlet.name));
    res.json(
      ok(
        activations.map((activation) => ({
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
        }))
      )
    );
  })
);

// Planning data only (Backend Spec v3 §5.9) — this never drives attendance or
// check-in eligibility, it's just the itinerary a supervisor sees on mobile.
router.get(
  "/me/supervisor-routes",
  asyncHandler(async (req, res) => {
    const routes = await prisma.supervisorRoute.findMany({
      where: { supervisorStaffId: req.staff!.sub },
      include: { campaign: true },
      orderBy: { dateFrom: "asc" },
    });
    const outletIds = Array.from(new Set(routes.flatMap((r) => r.outletIds)));
    const outlets = await prisma.outlet.findMany({ where: { id: { in: outletIds } } });
    const outletById = new Map(outlets.map((o) => [o.id, o]));
    res.json(
      ok(
        routes.map((r) => ({
          id: r.id,
          campaign: { id: r.campaign.id, name: r.campaign.name },
          outlets: r.outletIds.map((id) => {
            const o = outletById.get(id);
            return { id, name: o?.name ?? id, address: o?.address ?? "" };
          }),
          dateFrom: r.dateFrom,
          dateTo: r.dateTo,
        }))
      )
    );
  })
);

export default router;
