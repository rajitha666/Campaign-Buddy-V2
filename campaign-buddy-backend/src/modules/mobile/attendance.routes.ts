import { Router } from "express";
import { dayDate } from "../../utils/dates";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError, ok } from "../../utils/apiResponse";
import { haversineDistanceMeters } from "../../utils/geo";
import { validate } from "../../middleware/validate";
import { s } from "../../schemas";
import { checkInStatus, resolveShiftStart } from "../../utils/attendanceWindow";
import { resolveCapturedAt } from "../../utils/clientTime";
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
    visitNo: rec.visitNo,
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
  return { OR: [{ staffId }, { supervisorStaffId: staffId }], deletedAt: null };
}

// A supervisor can visit one outlet several times a day (AttendanceRecord.visitNo),
// so "the record" for an activation-day is the latest visit, and "the open shift"
// is the visit with no check-out yet. Promoters only ever have visit 1.
const isSupervisor = (req: { staff?: { userType?: string } }) => req.staff?.userType === "supervisor";
const latestVisit = (activationId: string, staffId: string, date: Date) =>
  prisma.attendanceRecord.findFirst({ where: { activationId, staffId, date }, orderBy: { visitNo: "desc" } });
const openVisit = (activationId: string, staffId: string, date: Date) =>
  prisma.attendanceRecord.findFirst({
    where: { activationId, staffId, date, checkInAt: { not: null }, checkOutAt: null },
    orderBy: { visitNo: "desc" },
  });

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
    const staffId = req.staff!.sub;

    // The person's open shift (if any) wherever it is, plus — for promoters — the
    // activations they have already checked out of today. The app uses these to
    // lock check-in elsewhere while a shift is open and to close off outlets
    // already worked; supervisors are free to return, so theirs is always empty.
    const open = await prisma.attendanceRecord.findFirst({
      where: { staffId, date: today, checkInAt: { not: null }, checkOutAt: null },
    });
    const worked = isSupervisor(req)
      ? []
      : await prisma.attendanceRecord.findMany({
          where: { staffId, date: today, checkInAt: { not: null }, checkOutAt: { not: null } },
          select: { activationId: true },
        });
    const shiftContext = {
      openAssignmentId: open?.activationId ?? null,
      workedAssignmentIds: [...new Set(worked.map((w) => w.activationId))],
    };

    // With no assignmentId, report on the open shift's activation first so a
    // multi-outlet promoter isn't shown an arbitrary other outlet.
    const activation = assignmentId
      ? await prisma.activation.findFirst({ where: { id: assignmentId, ...activationStaffScope(staffId) } })
      : open
        ? await prisma.activation.findUnique({ where: { id: open.activationId } })
        : await prisma.activation.findFirst({
            where: { dateFrom: { lte: today }, dateTo: { gte: today }, ...activationStaffScope(staffId) },
          });
    const empty = {
      checkedIn: false, checkInAt: null, checkOutAt: null,
      shiftDurationSeconds: 0, locationVerified: false, status: "pending" as const,
      assignmentId: activation?.id ?? null, visitNo: null, ...shiftContext,
    };
    if (!activation) return res.json(ok(empty));
    const record = await latestVisit(activation.id, staffId, today);
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
        assignmentId: activation.id,
        visitNo: record.visitNo,
        ...shiftContext,
      })
    );
  })
);

router.post(
  "/attendance/check-in",
  validate({ body: s.checkIn }),
  asyncHandler(async (req, res) => {
    const { assignmentId, latitude, longitude, capturedAt } = req.body as {
      assignmentId?: string;
      latitude: number;
      longitude: number;
      capturedAt?: string;
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

    // A promoter may work one outlet in the morning and another in the afternoon
    // (checking out of the first comes first — see the open-shift lock below and
    // the sales-confirmed rule at check-out), but never returns to an outlet they
    // have already checked out of today, even under a different campaign.
    // Supervisors are exempt: they revisit outlets, and every visit is its own
    // record (docs/api-spec.md /me/assignments).
    if (!isSupervisor(req)) {
      const workedHere = await prisma.attendanceRecord.findFirst({
        where: {
          staffId: req.staff!.sub,
          checkInAt: { not: null },
          checkOutAt: { not: null },
          date: today,
          activation: { outletId: activation.outletId },
        },
      });
      if (workedHere) {
        throw new ApiError(409, "ALREADY_CHECKED_OUT", "You have already checked out of this outlet today.");
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
    // A check-in the app queued offline is judged (late/on-time) and recorded at
    // the time the promoter actually did it, not when it finally synced.
    const now = resolveCapturedAt(capturedAt);
    const status = checkInStatus(
      resolveShiftStart(activation, activation.campaign, today),
      now
    );

    const checkInData = {
      checkInAt: now,
      checkInLat: latitude,
      checkInLng: longitude,
      checkInLocationVerified,
      status,
    };
    // The one-open-shift lock has passed, so any earlier row for this activation-day
    // is closed. A row that never had a check-in (e.g. a leave placeholder) is
    // filled in; otherwise this is a new visit — the supervisor's next one.
    const latest = await latestVisit(activation.id, req.staff!.sub, today);
    const record =
      latest && !latest.checkInAt
        ? await prisma.attendanceRecord.update({ where: { id: latest.id }, data: checkInData })
        : await prisma.attendanceRecord.create({
            data: {
              activationId: activation.id,
              staffId: req.staff!.sub,
              date: today,
              visitNo: (latest?.visitNo ?? 0) + 1,
              ...checkInData,
            },
          });

    res.status(201).json(ok(toAttendanceRecord(record, req.staff!.sub)));
  })
);

router.post(
  "/attendance/check-out",
  validate({ body: s.checkOut }),
  asyncHandler(async (req, res) => {
    const { assignmentId, latitude, longitude, capturedAt } = req.body as {
      assignmentId?: string;
      latitude?: number;
      longitude?: number;
      capturedAt?: string;
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

    const record = await openVisit(activation.id, req.staff!.sub, today);
    if (!record || !record.checkInAt) {
      throw new ApiError(422, "NOT_CHECKED_IN", "You are not currently checked in");
    }

    const summary = await prisma.salesSummary.findUnique({
      where: { activationId_date: { activationId: activation.id, date: today } },
    });
    // A promoter closes their shift only once the day's sales numbers are
    // confirmed — that is what lets them move on to another outlet. (Supervisors
    // don't enter sales, so their visits close freely.)
    if (!isSupervisor(req) && !summary?.confirmed) {
      throw new ApiError(422, "SALES_NOT_CONFIRMED", "Confirm today's sales summary before checking out.");
    }

    // Queued-offline check-out: record when it really happened, never before the check-in.
    const capturedOutAt = resolveCapturedAt(capturedAt);
    const checkOutAt = capturedOutAt < record.checkInAt ? record.checkInAt : capturedOutAt;

    const updated = await prisma.attendanceRecord.update({
      where: { id: record.id },
      data: {
        checkOutAt,
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
