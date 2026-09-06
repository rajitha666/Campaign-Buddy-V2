import { Router } from "express";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError, ok } from "../../utils/apiResponse";
import { haversineDistanceMeters } from "../../utils/geo";

const router = Router();
const GRACE_PERIOD_MINUTES = 10; // Confirmed v3 — stays hardcoded, not configurable yet (Spec §5.6/§8)

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

router.get(
  "/attendance/today",
  asyncHandler(async (req, res) => {
    const today = startOfDay(new Date());
    const activation = await prisma.activation.findFirst({
      where: { staffId: req.staff!.sub, dateFrom: { lte: today }, dateTo: { gte: today } },
    });
    if (!activation) return res.json(ok(null));
    const record = await prisma.attendanceRecord.findUnique({
      where: { activationId_date: { activationId: activation.id, date: today } },
    });
    res.json(ok(record));
  })
);

router.post(
  "/attendance/check-in",
  asyncHandler(async (req, res) => {
    const { latitude, longitude } = req.body as { latitude: number; longitude: number };
    if (latitude == null || longitude == null) {
      throw new ApiError(400, "VALIDATION_ERROR", "latitude and longitude required");
    }

    const today = startOfDay(new Date());
    const activation = await prisma.activation.findFirst({
      where: { staffId: req.staff!.sub, dateFrom: { lte: today }, dateTo: { gte: today } },
      include: { outlet: true },
    });
    if (!activation) throw new ApiError(404, "NOT_FOUND", "No assignment for today");

    // Global one-open-shift lock (Spec v3 §5.1) — across EVERY Activation this staff
    // member has, not just this one. Confirmed: concurrent Activation assignment is
    // fine, concurrent open check-ins are not.
    const openElsewhere = await prisma.attendanceRecord.findFirst({
      where: {
        checkInAt: { not: null },
        checkOutAt: null,
        activation: { staffId: req.staff!.sub },
      },
      include: { activation: true },
    });
    if (openElsewhere) {
      const sameActivation = openElsewhere.activationId === activation.id;
      throw new ApiError(
        409,
        "ALREADY_CHECKED_IN",
        sameActivation
          ? "You are already checked in for this activation."
          : "You are already checked in on another activation. Check out there first."
      );
    }

    // Geofence — SOFT FLAG ONLY, confirmed v3 (§5.6). Never blocks check-in.
    const distance = haversineDistanceMeters(
      latitude,
      longitude,
      activation.outlet.latitude,
      activation.outlet.longitude
    );
    const checkInLocationVerified = distance <= activation.outlet.geofenceRadiusMeters;

    // Late/on-time vs. shiftStart + grace period
    const now = new Date();
    let status: "on_time" | "late" = "on_time";
    if (activation.shiftStart) {
      const graceDeadline = new Date(activation.shiftStart.getTime() + GRACE_PERIOD_MINUTES * 60000);
      if (now > graceDeadline) status = "late";
    }

    const record = await prisma.attendanceRecord.upsert({
      where: { activationId_date: { activationId: activation.id, date: today } },
      create: {
        activationId: activation.id,
        date: today,
        checkInAt: now,
        checkInLat: latitude,
        checkInLng: longitude,
        checkInLocationVerified,
        status,
      },
      update: {
        checkInAt: now,
        checkInLat: latitude,
        checkInLng: longitude,
        checkInLocationVerified,
        status,
        // Re-check-in (e.g. after an accidental check-out earlier today) starts a
        // fresh shift — clear the prior check-out so the one-open-shift lock and
        // downstream "is this shift open?" checks stay consistent.
        checkOutAt: null,
        checkOutLat: null,
        checkOutLng: null,
        salesSummaryConfirmedAtCheckout: false,
      },
    });

    res.status(201).json(ok(record));
  })
);

router.post(
  "/attendance/check-out",
  asyncHandler(async (req, res) => {
    const { latitude, longitude } = req.body as { latitude: number; longitude: number };
    const today = startOfDay(new Date());

    const activation = await prisma.activation.findFirst({
      where: { staffId: req.staff!.sub, dateFrom: { lte: today }, dateTo: { gte: today } },
    });
    if (!activation) throw new ApiError(404, "NOT_FOUND", "No assignment for today");

    const record = await prisma.attendanceRecord.findUnique({
      where: { activationId_date: { activationId: activation.id, date: today } },
    });
    if (!record || !record.checkInAt || record.checkOutAt) {
      throw new ApiError(422, "NOT_CHECKED_IN", "You are not currently checked in");
    }

    const summary = await prisma.salesSummary.findUnique({
      where: { activationId_date: { activationId: activation.id, date: today } },
    });

    const updated = await prisma.attendanceRecord.update({
      where: { id: record.id },
      data: {
        checkOutAt: new Date(),
        checkOutLat: latitude ?? null,
        checkOutLng: longitude ?? null,
        salesSummaryConfirmedAtCheckout: summary?.confirmed ?? false,
      },
    });

    res.json(ok(updated));
  })
);

router.get(
  "/attendance/history",
  asyncHandler(async (req, res) => {
    const range = (req.query.range as string) || "week";
    const days = range === "month" ? 30 : 7;
    const since = new Date(Date.now() - days * 86400000);

    const records = await prisma.attendanceRecord.findMany({
      where: { activation: { staffId: req.staff!.sub }, date: { gte: since } },
      orderBy: { date: "desc" },
    });
    res.json(ok(records));
  })
);

export default router;
