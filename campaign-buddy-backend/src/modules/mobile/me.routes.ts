import { Router } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError, ok, notFound } from "../../utils/apiResponse";
import { dayDate } from "../../utils/dates";
import { resolveShiftStart, resolveShiftEnd } from "../../utils/attendanceWindow";

const router = Router();

// Staff self-service profile photo upload (#18/#29) — same disk-storage scheme
// as the admin side (staff.routes.ts / catalog.routes.ts); served at /uploads.
const staffPhotosDir = path.join(process.cwd(), "uploads", "staff");
fs.mkdirSync(staffPhotosDir, { recursive: true });
const staffPhotoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, staffPhotosDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
      cb(null, `${req.staff!.sub}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) return cb(new ApiError(400, "VALIDATION_ERROR", "Only image files are allowed"));
    cb(null, true);
  },
});

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
        profilePictureUrl: staff.profilePictureUrl,
      })
    );
  })
);

// Staff upload/update their OWN profile picture from the app (#18).
router.post(
  "/me/photo",
  staffPhotoUpload.single("image"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, "VALIDATION_ERROR", "image file is required");
    const profilePictureUrl = `/uploads/staff/${req.file.filename}`;
    const updated = await prisma.staff.update({
      where: { id: req.staff!.sub },
      data: { profilePictureUrl },
    });
    res.json(ok({ profilePictureUrl: updated.profilePictureUrl }));
  })
);

router.get(
  "/me/assignments/today",
  asyncHandler(async (req, res) => {
    const today = dayDate();
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
        // Effective shift for today — the activation's own override, else its
        // campaign's configured shift window (enhancement: per-campaign shift).
        shiftStart: resolveShiftStart(activation, activation.campaign, today),
        shiftEnd: resolveShiftEnd(activation, activation.campaign, today),
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
    const date = dayDate(typeof req.query.date === "string" ? req.query.date : undefined);
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
          shiftStart: resolveShiftStart(activation, activation.campaign, date),
          shiftEnd: resolveShiftEnd(activation, activation.campaign, date),
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
