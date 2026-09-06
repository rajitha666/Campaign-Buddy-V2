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
    const { outletId, dateFrom, dateTo } = req.query as { outletId?: string; dateFrom?: string; dateTo?: string };
    const allowed = outletIdsAllowed(req);
    if (outletId) assertOutletAllowed(req, outletId);

    const rows = await prisma.attendanceRecord.findMany({
      where: {
        activation: {
          campaignId: req.params.campaignId,
          ...(outletId ? { outletId } : allowed ? { outletId: { in: allowed } } : {}),
        },
        ...(dateFrom || dateTo ? { date: { ...(dateFrom ? { gte: new Date(dateFrom) } : {}), ...(dateTo ? { lte: new Date(dateTo) } : {}) } } : {}),
      },
      include: { activation: { include: { staff: true, outlet: true } } },
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
    });
    const totals = rows.reduce((acc, r) => ({ footFall: acc.footFall + r.footFall, approached: acc.approached + r.approached, converted: acc.converted + r.converted }), { footFall: 0, approached: 0, converted: 0 });
    res.json(ok({ totals, byDay: rows }));
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
    if (req.body.outletIds) (req.body.outletIds as string[]).forEach((id) => assertOutletAllowed(req, id));
    const updated = await prisma.supervisorRoute.update({ where: { id: req.params.id }, data: req.body });
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

export default router;
