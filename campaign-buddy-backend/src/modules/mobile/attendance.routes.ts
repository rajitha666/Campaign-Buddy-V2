import { Router } from "express";
import { dayDate } from "../../utils/dates";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError, ok } from "../../utils/apiResponse";
import { haversineDistanceMeters } from "../../utils/geo";
import { validate } from "../../middleware/validate";
import { s } from "../../schemas";
import { checkInStatus, resolveShiftStart } from "../../utils/attendanceWindow";
import type { AttendanceRecord } from "@prisma/client";

const router = Router();

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

// #63 fixed /me/assignments to surface a supervisor's route visits via
// supervisorStaffId — the attendance routes must resolve the same Activations
// or the app gets "No assignment for today" with an id /me/assignments just
// returned. A supervisor is never Activation.staffId; a promoter is never
// supervisorStaffId, so the OR is safe for both.
//
// This only RESOLVES which activations someone may act on. Attendance rows are
// keyed per person (AttendanceRecord.staffId): a promoter and the supervisor
// covering the same activation each have their own row, so every record lookup
// below is by `staffId`, never by "records on my activations".
function activationStaffScope(staffId: string) {
  return { OR: [{ staffId }, { supervisorStaffId: staffId }] };
}

const dayKey = (activationId: string, staffId: string, date: Date) => ({ activationId_staffId_date: { activationId, staffId, date } });

router.get(
  "/attendance/today",
  asyncHandler(async (req, res) => {
    const today = dayDate();
    // A supervisor can have several concurrent Activations today (one per
    // route outlet); `?assignmentId=` lets the caller ask about a specific
    // one instead of relying on an arbitrary findFirst pick. Promoters never
    // pass this — they only ever have one Activation, so behavior for them
    // is unchanged.
    const assignmentId = typeof req.query.assignmentId === "string" ? req.query.assignmentId : undefined;
    const activation = assignmentId
      ? await prisma.activation.findFirst({ where: { id: assignmentId, ...activationStaffScope(req.staff!.sub) } })
      : await prisma.activation.findFirst({
          where: { dateFrom: { lte: today }, dateTo: { gte: today }, ...activationStaffScope(req.staff!.sub) },
        });
    const empty = {
      checkedIn: false, checkInAt: null, checkOutAt: null,
      shiftDurationSeconds: 0, locationVerified: false, status: "pending" as const,
    };
    if (!activation) return res.json(ok(empty));
    const record = await prisma.attendanceRecord.findUnique({ where: dayKey(activation.id, req.staff!.sub, today) });
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

    const today = dayDate();
    let activation;
    if (assignmentId) {
      // Supervisors check in at outlets ACTIVE TODAY only — a route id from
      // a previous day (e.g. a stale app cache) must not open a shift.
      activation = await prisma.activation.findFirst({
        where: { id: assignmentId, dateFrom: { lte: today }, dateTo: { gte: today }, ...activationStaffScope(req.staff!.sub) },
        include: { outlet: true, campaign: true },
      });
    } else {
      activation = await prisma.activation.findFirst({
        where: { dateFrom: { lte: today }, dateTo: { gte: today }, ...activationStaffScope(req.staff!.sub) },
        include: { outlet: true, campaign: true },
      });
    }
    if (!activation) throw new ApiError(404, "NOT_FOUND", "No assignment for today");

    // A shift left open from a PREVIOUS day (crash, dead battery, forgot to
    // check out) is not a real concurrent check-in — it's abandoned. Without
    // this, the lock below matches it forever and staff get a false
    // "already checked in" on a day where /attendance/today correctly shows
    // them as not checked in. Close these out before evaluating the lock.
    const staleOpenShifts = await prisma.attendanceRecord.findMany({
      where: {
        staffId: req.staff!.sub,
        checkInAt: { not: null },
        checkOutAt: null,
        date: { lt: today },
      },
    });
    for (const stale of staleOpenShifts) {
      await prisma.attendanceRecord.update({
        where: { id: stale.id },
        data: { checkOutAt: new Date(stale.date.getTime() + 24 * 60 * 60 * 1000 - 1) },
      });
    }

    // Promoters are done for the day once they check out — no re-check-in
    // (client request 2026-09). Supervisors are exempt: they check out of one
    // route outlet and check into the next (docs/api-spec.md /me/assignments).
    if (req.staff!.userType !== "supervisor") {
      const checkedOutToday = await prisma.attendanceRecord.findFirst({
        where: {
          staffId: req.staff!.sub,
          checkInAt: { not: null },
          checkOutAt: { not: null },
          date: today,
        },
      });
      if (checkedOutToday) {
        throw new ApiError(409, "ALREADY_CHECKED_OUT", "You have already checked out for today.");
      }
    }

    // Global one-open-shift lock (Spec v3 §5.1) — across EVERY Activation this staff
    // member has, not just this one. Confirmed: concurrent Activation assignment is
    // fine, concurrent open check-ins are not.
    const openElsewhere = await prisma.attendanceRecord.findFirst({
      where: { staffId: req.staff!.sub, checkInAt: { not: null }, checkOutAt: null },
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

    // Late/on-time vs. the effective shift start + grace period (§5.6): the
    // activation's own override if set, else the campaign's configured shift,
    // else the hardcoded ideal window as a last resort (enhancement: per-
    // campaign shift windows).
    const now = new Date();
    const status = checkInStatus(
      resolveShiftStart(activation, activation.campaign, today),
      now
    );

    const record = await prisma.attendanceRecord.upsert({
      where: dayKey(activation.id, req.staff!.sub, today),
      create: {
        activationId: activation.id,
        staffId: req.staff!.sub,
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
    const { assignmentId, latitude, longitude } = req.body as {
      assignmentId?: string;
      latitude?: number;
      longitude?: number;
    };
    const today = dayDate();

    // Same resolution as check-in: a supervisor checks out of ONE route
    // outlet, so the client sends that assignment's id. When it's missing,
    // target the staff member's OPEN shift — the bare today-window findFirst
    // below would otherwise pick an arbitrary activation and 422 with
    // NOT_CHECKED_IN while a real shift is open on another outlet. Promoters
    // omit it too and resolve to their single (open) activation the same way,
    // so their behavior is unchanged.
    let activation;
    if (assignmentId) {
      // Supervisors check in/out of outlets ACTIVE TODAY only — an id from a
      // route visit on a previous day (or a future one) must not pass.
      activation = await prisma.activation.findFirst({
        where: { id: assignmentId, dateFrom: { lte: today }, dateTo: { gte: today }, ...activationStaffScope(req.staff!.sub) },
      });
    } else {
      const openElsewhere = await prisma.attendanceRecord.findFirst({
        where: { staffId: req.staff!.sub, checkInAt: { not: null }, checkOutAt: null },
        orderBy: { date: "desc" },
      });
      activation = openElsewhere
        ? await prisma.activation.findUnique({ where: { id: openElsewhere.activationId } })
        : await prisma.activation.findFirst({
            where: { dateFrom: { lte: today }, dateTo: { gte: today }, ...activationStaffScope(req.staff!.sub) },
          });
    }
    if (!activation) throw new ApiError(404, "NOT_FOUND", "No assignment for today");

    const record = await prisma.attendanceRecord.findUnique({ where: dayKey(activation.id, req.staff!.sub, today) });
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
      where: { staffId: req.staff!.sub, date: { gte: since } },
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
