import { Router } from "express";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError, ok } from "../../utils/apiResponse";
import { haversineDistanceMeters } from "../../utils/geo";
import { validate } from "../../middleware/validate";
import { s } from "../../schemas";
import type { AttendanceRecord } from "@prisma/client";

const router = Router();
const GRACE_PERIOD_MINUTES = 10; // Confirmed v3 — stays hardcoded, not configurable yet (Spec §5.6/§8)

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// docs/api-spec.md §2.5 AttendanceRecord — the app expects userId /
// assignmentId, which are activation.staffId / activation.id in v3.
function toAttendanceRecord(rec: AttendanceRecord, staffId: string) {
  return {
    id: rec.id,
    userId: staffId,
    assignmentId: rec.activationId,
    date: rec.date,
    checkInAt: rec.checkInAt,
    checkInLat: rec.checkInLat,
    checkInLng: rec.checkInLng,
    checkInLocationVerified: rec.checkInLocationVerified,
    checkOutAt: rec.checkOutAt,
    checkOutLat: rec.checkOutLat,
    checkOutLng: rec.checkOutLng,
    salesSummaryConfirmedAtCheckout: rec.salesSummaryConfirmedAtCheckout,
    status: rec.status,
    leaveRequestId: rec.leaveRequestId,
  };
}

router.get(
  "/attendance/today",
  asyncHandler(async (req, res) => {
    const today = startOfDay(new Date());
    // A supervisor can have several concurrent Activations today (one per
    // route outlet); `?assignmentId=` lets the caller ask about a specific
    // one instead of relying on an arbitrary findFirst pick. Promoters never
    // pass this — they only ever have one Activation, so behavior for them
    // is unchanged.
    const assignmentId = typeof req.query.assignmentId === "string" ? req.query.assignmentId : undefined;
    const activation = assignmentId
      ? await prisma.activation.findFirst({ where: { id: assignmentId, staffId: req.staff!.sub } })
      : await prisma.activation.findFirst({
          where: { staffId: req.staff!.sub, dateFrom: { lte: today }, dateTo: { gte: today } },
        });
    const empty = {
      checkedIn: false, checkInAt: null, checkOutAt: null,
      shiftDurationSeconds: 0, locationVerified: false, status: "pending" as const,
    };
    if (!activation) return res.json(ok(empty));
    const record = await prisma.attendanceRecord.findUnique({
      where: { activationId_date: { activationId: activation.id, date: today } },
    });
    if (!record) return res.json(ok(empty));

    // docs/api-spec.md §5 GET /attendance/today — the slim view.
    const checkedIn = !!record.checkInAt && !record.checkOutAt;
    const end = record.checkOutAt ?? new Date();
    const shiftDurationSeconds = record.checkInAt
      ? Math.max(0, Math.floor((end.getTime() - record.checkInAt.getTime()) / 1000))
      : 0;
    res.json(
      ok({
        checkedIn,
        checkInAt: record.checkInAt,
        checkOutAt: record.checkOutAt,
        shiftDurationSeconds,
        locationVerified: record.checkInLocationVerified,
        status: record.status,
      })
    );
  })
);

router.post(
  "/attendance/check-in",
  validate({ body: s.checkIn }),
  asyncHandler(async (req, res) => {
    const { assignmentId, latitude, longitude } = req.body as {
      assignmentId?: string;
      latitude: number;
      longitude: number;
    };

    const today = startOfDay(new Date());
    let activation;
    if (assignmentId) {
      activation = await prisma.activation.findFirst({
        where: { id: assignmentId, staffId: req.staff!.sub },
        include: { outlet: true },
      });
    } else {
      activation = await prisma.activation.findFirst({
        where: { staffId: req.staff!.sub, dateFrom: { lte: today }, dateTo: { gte: today } },
        include: { outlet: true },
      });
    }
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

    res.status(201).json(ok(toAttendanceRecord(record, req.staff!.sub)));
  })
);

router.post(
  "/attendance/check-out",
  validate({ body: s.checkOut }),
  asyncHandler(async (req, res) => {
    const { latitude, longitude } = req.body as { latitude?: number; longitude?: number };
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

    res.json(ok(toAttendanceRecord(updated, req.staff!.sub)));
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
      include: { leaveRequest: true },
    });
    res.json(
      ok(
        records.map((r) => ({
          date: r.date,
          checkInAt: r.checkInAt,
          checkOutAt: r.checkOutAt,
          status: r.status,
          ...(r.leaveRequest ? { leaveReason: r.leaveRequest.reason } : {}),
        }))
      )
    );
  })
);

export default router;
