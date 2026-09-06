import { Router } from "express";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ok, okList, notFound, validationError } from "../../utils/apiResponse";
import { requireRole } from "../../middleware/userAuth";
import { requireCampaignAccess, outletIdsAllowed, assertOutletAllowed } from "../../middleware/campaignAccess";

const router = Router();

// ---- Attendance ----
router.get(
  "/campaigns/:campaignId/attendance",
  requireCampaignAccess,
  asyncHandler(async (req, res) => {
    const { outletId, dateFrom, dateTo, role } = req.query as {
      outletId?: string; dateFrom?: string; dateTo?: string; role?: "promoter" | "supervisor";
    };
    const allowed = outletIdsAllowed(req);
    if (outletId) assertOutletAllowed(req, outletId);

    const rows = await prisma.attendanceRecord.findMany({
      where: {
        activation: {
          campaignId: req.params.campaignId,
          ...(outletId ? { outletId } : allowed ? { outletId: { in: allowed } } : {}),
          ...(role ? { staff: { is: { userType: role } } } : {}),
        },
        ...(dateFrom || dateTo ? { date: { ...(dateFrom ? { gte: new Date(dateFrom) } : {}), ...(dateTo ? { lte: new Date(dateTo) } : {}) } } : {}),
      },
      include: { activation: { include: { staff: true, outlet: true } } },
      orderBy: { date: "desc" },
    });
    res.json(okList(rows, rows.length));
  })
);

// ---- Sales ----
router.get(
  "/campaigns/:campaignId/sales",
  requireCampaignAccess,
  asyncHandler(async (req, res) => {
    const { outletId, dateFrom, dateTo } = req.query as { outletId?: string; dateFrom?: string; dateTo?: string };
    const allowed = outletIdsAllowed(req);
    if (outletId) assertOutletAllowed(req, outletId);

    const rows = await prisma.salesRecord.findMany({
      where: {
        activationItem: {
          activation: {
            campaignId: req.params.campaignId,
            ...(outletId ? { outletId } : allowed ? { outletId: { in: allowed } } : {}),
          },
        },
        ...(dateFrom || dateTo ? { date: { ...(dateFrom ? { gte: new Date(dateFrom) } : {}), ...(dateTo ? { lte: new Date(dateTo) } : {}) } } : {}),
      },
      include: { activationItem: { include: { campaignItem: { include: { item: true } }, activation: { include: { staff: true, outlet: true } } } } },
    });
    res.json(okList(rows, rows.length));
  })
);

router.patch(
  "/campaigns/:campaignId/sales/:salesRecordId",
  requireCampaignAccess,
  requireRole("adm", "usr"),
  asyncHandler(async (req, res) => {
    const existing = await prisma.salesRecord.findUnique({
      where: { id: req.params.salesRecordId },
      include: { activationItem: { include: { activation: true } } },
    });
    if (!existing) throw notFound("Sales record");
    assertOutletAllowed(req, existing.activationItem.activation.outletId);

    // Mid-day restock: openingStock can be raised in place (§2.6) — soldToday is
    // validated against whatever openingStock is AFTER this update, not the morning's.
    const nextOpeningStock = req.body.openingStock ?? existing.openingStock;
    const nextSoldToday = req.body.soldToday ?? existing.soldToday;
    if (nextSoldToday > nextOpeningStock) throw validationError("soldToday cannot exceed openingStock", "soldToday");

    const updated = await prisma.salesRecord.update({ where: { id: req.params.salesRecordId }, data: req.body });
    res.json(ok(updated));
  })
);

// NEW in v3 — cascading-dropdown lookup for the Update Sales screen, folded in from
// the retired contract doc's §7.7.4, moved under the campaign-scoped router (Spec §4.2).
router.get(
  "/campaigns/:campaignId/sales/lookup",
  requireCampaignAccess,
  asyncHandler(async (req, res) => {
    const { staffId, outletId, activationId, date } = req.query as {
      staffId?: string; outletId?: string; activationId?: string; date?: string;
    };
    if (outletId) assertOutletAllowed(req, outletId);
    if (!date) throw validationError("date is required", "date");

    const activation = activationId
      ? await prisma.activation.findUnique({ where: { id: activationId } })
      : await prisma.activation.findFirst({ where: { campaignId: req.params.campaignId, ...(staffId ? { staffId } : {}), ...(outletId ? { outletId } : {}) } });
    if (!activation) throw notFound("Activation");
    assertOutletAllowed(req, activation.outletId);

    const activationItems = await prisma.activationItem.findMany({
      where: { activationId: activation.id },
      include: { campaignItem: { include: { item: true } }, salesRecords: { where: { date: new Date(date) } } },
    });

    res.json(
      okList(
        activationItems.map((ai) => ({
          id: ai.salesRecords[0]?.id ?? null,
          itemName: ai.campaignItem.item.name,
          unitPrice: ai.campaignItem.item.unitPrice,
          openingStock: ai.salesRecords[0]?.openingStock ?? 0,
          soldToday: ai.salesRecords[0]?.soldToday ?? 0,
        })),
        activationItems.length
      )
    );
  })
);

// ---- Stats ----
router.get(
  "/campaigns/:campaignId/stats",
  requireCampaignAccess,
  asyncHandler(async (req, res) => {
    const { outletId, dateFrom, dateTo } = req.query as { outletId?: string; dateFrom?: string; dateTo?: string };
    const allowed = outletIdsAllowed(req);
    if (outletId) assertOutletAllowed(req, outletId);

    const rows = await prisma.dailyStats.findMany({
      where: {
        activation: { campaignId: req.params.campaignId, ...(outletId ? { outletId } : allowed ? { outletId: { in: allowed } } : {}) },
        ...(dateFrom || dateTo ? { date: { ...(dateFrom ? { gte: new Date(dateFrom) } : {}), ...(dateTo ? { lte: new Date(dateTo) } : {}) } } : {}),
      },
      include: { activation: { include: { outlet: true, staff: true } } },
      orderBy: { date: "asc" },
    });
    const totals = rows.reduce((acc, r) => ({ footFall: acc.footFall + r.footFall, approached: acc.approached + r.approached, converted: acc.converted + r.converted }), { footFall: 0, approached: 0, converted: 0 });
    // byDay rows carry outletId/outletName/staffName flattened alongside the raw
    // DailyStats fields so the portal's status / outlet screens can group without
    // a second lookup.
    const byDay = rows.map((r) => ({
      ...r,
      outletId: r.activation.outletId,
      outletName: r.activation.outlet.name,
      staffName: r.activation.staff.fullName,
      activationName: r.activation.name,
    }));
    res.json(ok({ totals, byDay }));
  })
);

// ---- Live tracking ---- Confirmed campaign-scoped, not global (§5.9/Changelog #12)
router.get(
  "/campaigns/:campaignId/tracking/live",
  requireCampaignAccess,
  asyncHandler(async (req, res) => {
    const allowed = outletIdsAllowed(req);
    const openShifts = await prisma.attendanceRecord.findMany({
      where: {
        checkInAt: { not: null },
        checkOutAt: null,
        activation: { campaignId: req.params.campaignId, ...(allowed ? { outletId: { in: allowed } } : {}) },
      },
      include: { activation: { include: { staff: true, outlet: true } } },
    });

    const positions = await Promise.all(
      openShifts.map(async (shift) => {
        const lastPing = await prisma.trackingPing.findFirst({
          where: { activationId: shift.activationId },
          orderBy: { capturedAt: "desc" },
        });
        return {
          staffName: shift.activation.staff.fullName,
          outletName: shift.activation.outlet.name,
          checkedInSince: shift.checkInAt,
          lastPosition: lastPing ? { latitude: lastPing.latitude, longitude: lastPing.longitude, capturedAt: lastPing.capturedAt } : null,
        };
      })
    );
    res.json(okList(positions, positions.length));
  })
);

// ---- Leave requests ----
router.get(
  "/campaigns/:campaignId/leave-requests",
  requireCampaignAccess,
  asyncHandler(async (req, res) => {
    const allowed = outletIdsAllowed(req);
    const activations = await prisma.activation.findMany({
      where: { campaignId: req.params.campaignId, ...(allowed ? { outletId: { in: allowed } } : {}) },
      select: { staffId: true },
    });
    const staffIds = [...new Set(activations.map((a) => a.staffId))];
    const rows = await prisma.leaveRequest.findMany({ where: { staffId: { in: staffIds } }, include: { staff: true } });
    res.json(okList(rows, rows.length));
  })
);

router.patch(
  "/campaigns/:campaignId/leave-requests/:id",
  requireCampaignAccess,
  requireRole("adm", "usr"),
  asyncHandler(async (req, res) => {
    const { status } = req.body as { status: "approved" | "declined" };
    const updated = await prisma.leaveRequest.update({ where: { id: req.params.id }, data: { status, decidedAt: new Date() } });
    res.json(ok(updated));
  })
);

// ---- Supervisor Routes (Assign Routes) — NEW in v3 (§2.6/§4.2/§5.9) ----
router.get(
  "/campaigns/:campaignId/supervisor-routes",
  requireCampaignAccess,
  asyncHandler(async (req, res) => {
    const { supervisorId, outletId, dateFrom, dateTo } = req.query as {
      supervisorId?: string; outletId?: string; dateFrom?: string; dateTo?: string;
    };
    const rows = await prisma.supervisorRoute.findMany({
      where: {
        campaignId: req.params.campaignId,
        ...(supervisorId ? { supervisorStaffId: supervisorId } : {}),
        ...(outletId ? { outletIds: { has: outletId } } : {}),
        ...(dateFrom ? { dateTo: { gte: new Date(dateFrom) } } : {}),
        ...(dateTo ? { dateFrom: { lte: new Date(dateTo) } } : {}),
      },
      include: { supervisor: true },
    });
    res.json(okList(rows, rows.length));
  })
);

router.post(
  "/campaigns/:campaignId/supervisor-routes",
  requireCampaignAccess,
  requireRole("adm", "usr"),
  asyncHandler(async (req, res) => {
    const { supervisorStaffId, outletIds, dateFrom, dateTo } = req.body as {
      supervisorStaffId: string; outletIds: string[]; dateFrom: string; dateTo: string;
    };
    outletIds.forEach((id) => assertOutletAllowed(req, id));
    const created = await prisma.supervisorRoute.create({
      data: { campaignId: req.params.campaignId, supervisorStaffId, outletIds, dateFrom: new Date(dateFrom), dateTo: new Date(dateTo) },
    });
    res.status(201).json(ok(created));
  })
);

router.patch(
  "/campaigns/:campaignId/supervisor-routes/:id",
  requireCampaignAccess,
  requireRole("adm", "usr"),
  asyncHandler(async (req, res) => {
    const b = req.body as { supervisorStaffId?: string; outletIds?: string[]; dateFrom?: string; dateTo?: string };
    if (b.outletIds) b.outletIds.forEach((id) => assertOutletAllowed(req, id));
    const data: Record<string, unknown> = {};
    if (b.supervisorStaffId !== undefined) data.supervisorStaffId = b.supervisorStaffId;
    if (b.outletIds !== undefined) data.outletIds = b.outletIds;
    if (b.dateFrom !== undefined) data.dateFrom = new Date(b.dateFrom);
    if (b.dateTo !== undefined) data.dateTo = new Date(b.dateTo);
    const updated = await prisma.supervisorRoute.update({ where: { id: req.params.id }, data });
    res.json(ok(updated));
  })
);

router.delete(
  "/campaigns/:campaignId/supervisor-routes/:id",
  requireCampaignAccess,
  requireRole("adm", "usr"),
  asyncHandler(async (req, res) => {
    await prisma.supervisorRoute.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);

// ---- Supervisor Tasks (QA checklist) — model existed since v3, endpoints added
// for portal completion. Portal-only config; the mobile app does not read it. ----
router.get(
  "/campaigns/:campaignId/supervisor-tasks",
  requireCampaignAccess,
  asyncHandler(async (req, res) => {
    const rows = await prisma.supervisorTask.findMany({
      where: { campaignId: req.params.campaignId },
      orderBy: { createdAt: "asc" },
    });
    res.json(okList(rows, rows.length));
  })
);

router.post(
  "/campaigns/:campaignId/supervisor-tasks",
  requireCampaignAccess,
  requireRole("adm", "usr"),
  asyncHandler(async (req, res) => {
    const { category, taskType, task } = req.body as { category: string; taskType: "range" | "feedback"; task: string };
    if (!category || !task) throw validationError("category and task are required");
    const created = await prisma.supervisorTask.create({
      data: { campaignId: req.params.campaignId, category, taskType: taskType ?? "feedback", task },
    });
    res.status(201).json(ok(created));
  })
);

router.patch(
  "/campaigns/:campaignId/supervisor-tasks/:id",
  requireCampaignAccess,
  requireRole("adm", "usr"),
  asyncHandler(async (req, res) => {
    const { category, taskType, task } = req.body as { category?: string; taskType?: "range" | "feedback"; task?: string };
    const updated = await prisma.supervisorTask.update({
      where: { id: req.params.id },
      data: {
        ...(category !== undefined ? { category } : {}),
        ...(taskType !== undefined ? { taskType } : {}),
        ...(task !== undefined ? { task } : {}),
      },
    });
    res.json(ok(updated));
  })
);

router.delete(
  "/campaigns/:campaignId/supervisor-tasks/:id",
  requireCampaignAccess,
  requireRole("adm", "usr"),
  asyncHandler(async (req, res) => {
    await prisma.supervisorTask.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);

// ---- Staff Absence — promoters whose activation covers `date` but who have no
// check-in that day. Computed, never stored (§5.2). ----
router.get(
  "/campaigns/:campaignId/absence",
  requireCampaignAccess,
  asyncHandler(async (req, res) => {
    const { date, outletId } = req.query as { date?: string; outletId?: string };
    if (!date) throw validationError("date is required", "date");
    if (outletId) assertOutletAllowed(req, outletId);
    const allowed = outletIdsAllowed(req);
    const day = new Date(date);
    day.setHours(0, 0, 0, 0);

    const activations = await prisma.activation.findMany({
      where: {
        campaignId: req.params.campaignId,
        dateFrom: { lte: day },
        dateTo: { gte: day },
        ...(outletId ? { outletId } : allowed ? { outletId: { in: allowed } } : {}),
      },
      include: { outlet: true, staff: true, attendanceRecords: { where: { date: day } } },
    });

    const absent = activations
      .filter((a) => !a.attendanceRecords[0]?.checkInAt)
      .map((a) => ({
        activationId: a.id,
        activationName: a.name,
        outletId: a.outletId,
        outletName: a.outlet.name,
        staffId: a.staffId,
        staffName: a.staff.fullName,
        onLeave: a.attendanceRecords[0]?.status === "leave",
      }));
    res.json(okList(absent, absent.length));
  })
);

// ---- Outlet Attendance — supervisor visit log: attendance rows for activations
// whose assigned staff is a supervisor. ----
router.get(
  "/campaigns/:campaignId/outlet-attendance",
  requireCampaignAccess,
  asyncHandler(async (req, res) => {
    const { date, outletId } = req.query as { date?: string; outletId?: string };
    if (outletId) assertOutletAllowed(req, outletId);
    const allowed = outletIdsAllowed(req);
    const where: Record<string, unknown> = {
      activation: {
        campaignId: req.params.campaignId,
        staff: { is: { userType: "supervisor" } },
        ...(outletId ? { outletId } : allowed ? { outletId: { in: allowed } } : {}),
      },
    };
    if (date) {
      const day = new Date(date);
      day.setHours(0, 0, 0, 0);
      where.date = day;
    }
    const rows = await prisma.attendanceRecord.findMany({
      where,
      include: { activation: { include: { staff: true, outlet: true } } },
      orderBy: { date: "desc" },
    });
    const shaped = rows.map((r) => ({
      id: r.id,
      supervisorName: r.activation.staff.fullName,
      staffName: r.activation.staff.fullName,
      outletName: r.activation.outlet.name,
      date: r.date,
      checkInAt: r.checkInAt,
      checkOutAt: r.checkOutAt,
    }));
    res.json(okList(shaped, shaped.length));
  })
);

// ---- GPS breadcrumb history (raw TrackingPing trail). Campaign-scoped like
// tracking/live (§5.9), split promoter vs supervisor by the activation's staff. ----
async function trackingHistory(req: any, userType: "promoter" | "supervisor") {
  const { staffId, date, outletId } = req.query as { staffId?: string; date?: string; outletId?: string };
  if (outletId) assertOutletAllowed(req, outletId);
  const allowed = outletIdsAllowed(req);

  let dateFilter: { gte: Date; lte: Date } | undefined;
  if (date) {
    const start = new Date(date); start.setHours(0, 0, 0, 0);
    const end = new Date(date); end.setHours(23, 59, 59, 999);
    dateFilter = { gte: start, lte: end };
  }

  const rows = await prisma.trackingPing.findMany({
    where: {
      ...(dateFilter ? { capturedAt: dateFilter } : {}),
      activation: {
        campaignId: req.params.campaignId,
        staff: { is: { userType, ...(staffId ? { id: staffId } : {}) } },
        ...(outletId ? { outletId } : allowed ? { outletId: { in: allowed } } : {}),
      },
    },
    include: { activation: { include: { staff: true, outlet: true } } },
    orderBy: { capturedAt: "asc" },
  });
  return rows.map((p) => ({
    id: p.id,
    staffId: p.activation.staffId,
    staffName: p.activation.staff.fullName,
    outletName: p.activation.outlet.name,
    latitude: p.latitude,
    longitude: p.longitude,
    accuracyMeters: p.accuracyMeters,
    capturedAt: p.capturedAt,
    appState: p.appState,
  }));
}

router.get(
  "/campaigns/:campaignId/tracking/promoter-history",
  requireCampaignAccess,
  asyncHandler(async (req, res) => {
    const rows = await trackingHistory(req, "promoter");
    res.json(okList(rows, rows.length));
  })
);

router.get(
  "/campaigns/:campaignId/tracking/supervisor-history",
  requireCampaignAccess,
  asyncHandler(async (req, res) => {
    const rows = await trackingHistory(req, "supervisor");
    res.json(okList(rows, rows.length));
  })
);

export default router;
