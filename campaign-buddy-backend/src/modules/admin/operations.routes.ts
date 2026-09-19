import { Router } from "express";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ok, okList, notFound, validationError } from "../../utils/apiResponse";
import { requireRole } from "../../middleware/userAuth";
import { requireCampaignAccess, outletIdsAllowed, assertOutletAllowed } from "../../middleware/campaignAccess";
import { dayDate, dayBounds } from "../../utils/dates";
import { validate } from "../../middleware/validate";
import { s } from "../../schemas";
import { computeTotalSales } from "../../utils/salesCalc";
import { activeDefsForCampaign, dayValueMap, serializeWithValues } from "../../utils/salesFieldStore";
import { loadChecklistData, average } from "../../utils/supervisorChecklist";

const router = Router();

// Shared server-side paging for the list-shaped log endpoints (§4.2: every
// /admin/v1 list accepts ?page=&pageSize=). Clamped so a caller can't enumerate
// the whole table in one request.
function paginate(req: any) {
  const page = Math.max(1, Number(req.query.page || 1) || 1);
  const requested = Number(req.query.pageSize || 25) || 25;
  const pageSize = Math.min(Math.max(1, requested), 200);
  return { skip: (page - 1) * pageSize, take: pageSize };
}

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

    // `role` is the role of the person who CHECKED IN (the record's staff) — a
    // supervisor covering a promoter's activation has their own record on it.
    const where = {
      activation: {
        campaignId: req.params.campaignId,
        ...(outletId ? { outletId } : allowed ? { outletId: { in: allowed } } : {}),
      },
      ...(role ? { staff: { is: { userType: role } } } : {}),
      ...(dateFrom || dateTo ? { date: { ...(dateFrom ? { gte: dayDate(dateFrom) } : {}), ...(dateTo ? { lte: dayDate(dateTo) } : {}) } } : {}),
    };
    const paged = paginate(req);
    const [rows, total] = await Promise.all([
      prisma.attendanceRecord.findMany({
        where,
        include: { staff: true, activation: { include: { staff: true, outlet: true } } },
        orderBy: { date: "desc" },
        ...paged,
      }),
      prisma.attendanceRecord.count({ where }),
    ]);
    res.json(okList(rows, total));
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

    const paged = paginate(req);
    const whereSales = {
      activationItem: {
        activation: {
          campaignId: req.params.campaignId,
          ...(outletId ? { outletId } : allowed ? { outletId: { in: allowed } } : {}),
        },
      },
      ...(dateFrom || dateTo ? { date: { ...(dateFrom ? { gte: dayDate(dateFrom) } : {}), ...(dateTo ? { lte: dayDate(dateTo) } : {}) } } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.salesRecord.findMany({
        where: whereSales,
        include: { activationItem: { include: { campaignItem: { include: { item: true } }, activation: { include: { staff: true, outlet: true } } } } },
        orderBy: { date: "asc" },
        ...paged,
      }),
      prisma.salesRecord.count({ where: whereSales }),
    ]);
    res.json(okList(rows, total));
  })
);

router.patch(
  "/campaigns/:campaignId/sales/:salesRecordId",
  requireCampaignAccess,
  requireRole("adm", "usr"),
  validate({ body: s.salesCorrect }),
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
    const when = dayDate(date);

    // Resolving by staffId/outletId alone (no explicit activationId) picks the
    // activation whose own date range covers the selected day, so the portal's
    // outlet+date-only Update Sales flow lands on the right promoter even when
    // an outlet has run more than one activation over time.
    const activation = activationId
      ? await prisma.activation.findUnique({ where: { id: activationId }, include: { staff: true } })
      : await prisma.activation.findFirst({
          where: {
            campaignId: req.params.campaignId,
            ...(staffId ? { staffId } : {}),
            ...(outletId ? { outletId } : {}),
            dateFrom: { lte: when },
            dateTo: { gte: when },
          },
          include: { staff: true },
        });
    if (!activation) throw notFound("Activation");
    assertOutletAllowed(req, activation.outletId);
    const [activationItems, salesDefs] = await Promise.all([
      prisma.activationItem.findMany({
        where: { activationId: activation.id },
        include: {
          campaignItem: { include: { item: true } },
          salesRecords: { where: { date: when } },
          salesFieldValues: { where: { date: when } },
        },
      }),
      activeDefsForCampaign(req.params.campaignId),
    ]);
    const dayDefs = salesDefs.filter((d) => d.scope === "day");
    const productDefs = salesDefs.filter((d) => d.scope === "product");
    const dayValues = await dayValueMap(activation.id, when);

    res.json({
      data: activationItems.map((ai) => {
        const vals = new Map(ai.salesFieldValues.map((v) => [v.definitionId, v.value]));
        return {
          id: ai.salesRecords[0]?.id ?? null,
          activationItemId: ai.id,
          itemName: ai.campaignItem.item.name,
          unitPrice: ai.campaignItem.item.unitPrice,
          openingStock: ai.salesRecords[0]?.openingStock ?? 0,
          soldToday: ai.salesRecords[0]?.soldToday ?? 0,
          customFields: serializeWithValues(productDefs, vals),
        };
      }),
      meta: {
        total: activationItems.length,
        activationId: activation.id,
        activationName: activation.name,
        staffId: activation.staffId,
        staffName: activation.staff.fullName,
        date,
        dayCustomFields: serializeWithValues(dayDefs, dayValues),
      },
    });
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
        ...(dateFrom || dateTo ? { date: { ...(dateFrom ? { gte: dayDate(dateFrom) } : {}), ...(dateTo ? { lte: dayDate(dateTo) } : {}) } } : {}),
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

router.patch(
  "/campaigns/:campaignId/stats/today",
  requireCampaignAccess,
  requireRole("adm", "usr"),
  validate({ body: s.statsUpdate }),
  asyncHandler(async (req, res) => {
    const today = dayDate(new Date().toISOString().slice(0, 10));
    const { footFall, approached, converted } = req.body as { footFall?: number; approached?: number; converted?: number };

    const activation = await prisma.activation.findFirst({
      where: {
        campaignId: req.params.campaignId,
        dateFrom: { lte: today },
        dateTo: { gte: today },
      },
    });
    if (!activation) throw notFound("Active activation for today");
    assertOutletAllowed(req, activation.outletId);

    const stats = await prisma.dailyStats.upsert({
      where: { activationId_date: { activationId: activation.id, date: today } },
      create: { activationId: activation.id, date: today, footFall: footFall ?? 0, approached: approached ?? 0, converted: converted ?? 0 },
      update: { ...(footFall != null ? { footFall } : {}), ...(approached != null ? { approached } : {}), ...(converted != null ? { converted } : {}) },
    });

    const totalSales = await computeTotalSales(prisma, activation.id, today);
    const conversionRate = stats.approached > 0 ? stats.converted / stats.approached : 0;

    res.json(ok({ ...stats, totalSales, conversionRate }));
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
      include: { staff: true, activation: { include: { outlet: true } } },
    });

    const positions = await Promise.all(
      openShifts.map(async (shift) => {
        // The pinging person's own latest position, not anyone else's on the same activation.
        const lastPing = await prisma.trackingPing.findFirst({
          where: { activationId: shift.activationId, staffId: shift.staffId },
          orderBy: { capturedAt: "desc" },
        });
        return {
          staffName: shift.staff.fullName,
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
    const paged = paginate(req);
    const whereLeave = { staffId: { in: staffIds } };
    const [rows, total] = await Promise.all([
      prisma.leaveRequest.findMany({ where: whereLeave, include: { staff: true }, orderBy: { fromDate: "desc" }, ...paged }),
      prisma.leaveRequest.count({ where: whereLeave }),
    ]);
    res.json(okList(rows, total));
  })
);

router.patch(
  "/campaigns/:campaignId/leave-requests/:id",
  requireCampaignAccess,
  requireRole("adm", "usr"),
  validate({ body: s.leaveDecide }),
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
        deletedAt: null,
        ...(supervisorId ? { supervisorStaffId: supervisorId } : {}),
        ...(outletId ? { outletIds: { has: outletId } } : {}),
        ...(dateFrom ? { dateTo: { gte: dayDate(dateFrom) } } : {}),
        ...(dateTo ? { dateFrom: { lte: dayDate(dateTo) } } : {}),
      },
      include: { supervisor: true },
    });
    res.json(okList(rows, rows.length));
  })
);

// Supervisors ON this campaign — union of "has a SupervisorRoute here" or
// "assigned to one of its activations" (Activation.supervisorStaffId). Backs
// the Assign Routes supervisor dropdown, which must scope to the campaign
// rather than offering the global staff pool.
router.get(
  "/campaigns/:campaignId/supervisors",
  requireCampaignAccess,
  asyncHandler(async (req, res) => {
    const where = {
      status: "active" as const,
      userType: "supervisor" as const,
      OR: [
        { supervisorRoutes: { some: { campaignId: req.params.campaignId, deletedAt: null } } },
        { supervising: { some: { campaignId: req.params.campaignId } } },
      ],
    };
    const [rows, total] = await Promise.all([
      prisma.staff.findMany({ where, include: { city: true }, orderBy: { fullName: "asc" } }),
      prisma.staff.count({ where }),
    ]);
    res.json(okList(rows, total)); // passwordHash omitted globally (src/utils/prisma.ts)
  })
);

router.post(
  "/campaigns/:campaignId/supervisor-routes",
  requireCampaignAccess,
  requireRole("adm", "usr"),
  validate({ body: s.supervisorRouteCreate }),
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
  validate({ body: s.supervisorRouteUpdate }),
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
    const existing = await prisma.supervisorRoute.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.deletedAt || existing.campaignId !== req.params.campaignId) throw notFound("Supervisor route");
    await prisma.supervisorRoute.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
    res.json(ok({ ...existing, deletedAt: new Date(), softDeleted: true }));
  })
);

// ---- Supervisor Tasks (QA checklist) — the per-campaign template that
// supervisors fill in on mobile during outlet visits (see
// mobile/supervisorChecklist.routes.ts). A `photo` task carries the number of
// setup photos to capture; range/feedback tasks always have imageCount 0. ----
function resolveTaskImageCount(taskType: "range" | "feedback" | "photo", imageCount: number | undefined): number {
  if (taskType !== "photo") return 0;
  if (!imageCount || imageCount < 1) throw validationError("imageCount must be at least 1 for a photo task", "imageCount");
  return imageCount;
}

router.get(
  "/campaigns/:campaignId/supervisor-tasks",
  requireCampaignAccess,
  asyncHandler(async (req, res) => {
    const rows = await prisma.supervisorTask.findMany({
      where: { campaignId: req.params.campaignId, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
    res.json(okList(rows, rows.length));
  })
);

router.post(
  "/campaigns/:campaignId/supervisor-tasks",
  requireCampaignAccess,
  requireRole("adm", "usr"),
  validate({ body: s.supervisorTaskCreate }),
  asyncHandler(async (req, res) => {
    const { category, taskType, task, imageCount } = req.body as {
      category: string;
      taskType?: "range" | "feedback" | "photo";
      task: string;
      imageCount?: number;
    };
    if (!category || !task) throw validationError("category and task are required");
    const type = taskType ?? "feedback";
    const created = await prisma.supervisorTask.create({
      data: { campaignId: req.params.campaignId, category, taskType: type, task, imageCount: resolveTaskImageCount(type, imageCount) },
    });
    res.status(201).json(ok(created));
  })
);

router.patch(
  "/campaigns/:campaignId/supervisor-tasks/:id",
  requireCampaignAccess,
  requireRole("adm", "usr"),
  validate({ body: s.supervisorTaskUpdate }),
  asyncHandler(async (req, res) => {
    const { category, taskType, task, imageCount } = req.body as {
      category?: string;
      taskType?: "range" | "feedback" | "photo";
      task?: string;
      imageCount?: number;
    };
    const existing = await prisma.supervisorTask.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.deletedAt || existing.campaignId !== req.params.campaignId) throw notFound("Supervisor task");
    const type = taskType ?? existing.taskType;
    if (type !== existing.taskType && (await prisma.supervisorTaskResponse.count({ where: { taskId: existing.id } })) > 0) {
      throw validationError("This task already has answers, so its type can't change. Add a new task instead.", "taskType");
    }
    const updated = await prisma.supervisorTask.update({
      where: { id: req.params.id },
      data: {
        ...(category !== undefined ? { category } : {}),
        ...(task !== undefined ? { task } : {}),
        taskType: type,
        imageCount: resolveTaskImageCount(type, imageCount ?? existing.imageCount),
      },
    });
    res.json(ok(updated));
  })
);

// Results of the mobile checklist: one row per task answered per outlet visit,
// newest first. Outlet-scoped users only see their granted outlets.
router.get(
  "/campaigns/:campaignId/supervisor-task-responses",
  requireCampaignAccess,
  asyncHandler(async (req, res) => {
    const { date, dateFrom, dateTo, outletId } = req.query as { date?: string; dateFrom?: string; dateTo?: string; outletId?: string };
    if (outletId) assertOutletAllowed(req, outletId);
    const allowed = outletIdsAllowed(req);
    const dateFilter = date
      ? { date: dayDate(date) }
      : dateFrom || dateTo
        ? { date: { ...(dateFrom ? { gte: dayDate(dateFrom) } : {}), ...(dateTo ? { lte: dayDate(dateTo) } : {}) } }
        : {};
    const where = {
      task: { campaignId: req.params.campaignId },
      activation: outletId ? { outletId } : allowed ? { outletId: { in: allowed } } : {},
      ...dateFilter,
    };
    const paged = paginate(req);
    const [rows, total] = await Promise.all([
      prisma.supervisorTaskResponse.findMany({
        where,
        include: { task: true, supervisor: true, photos: true, activation: { include: { staff: true, outlet: true } } },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        ...paged,
      }),
      prisma.supervisorTaskResponse.count({ where }),
    ]);
    // A supervisor can visit an outlet more than once a day; show when each visit began.
    const visitStarts = rows.length
      ? await prisma.attendanceRecord.findMany({
          where: {
            activationId: { in: [...new Set(rows.map((r) => r.activationId))] },
            staffId: { in: [...new Set(rows.map((r) => r.supervisorStaffId))] },
            date: { in: [...new Set(rows.map((r) => r.date.getTime()))].map((t) => new Date(t)) },
          },
          select: { activationId: true, staffId: true, date: true, visitNo: true, checkInAt: true },
        })
      : [];
    const visitStart = new Map(visitStarts.map((v) => [`${v.activationId}|${v.staffId}|${v.date.getTime()}|${v.visitNo}`, v.checkInAt]));
    const shaped = rows.map((r) => ({
      id: r.id,
      taskId: r.taskId,
      date: r.date,
      visitNo: r.visitNo,
      visitStartedAt: visitStart.get(`${r.activationId}|${r.supervisorStaffId}|${r.date.getTime()}|${r.visitNo}`) ?? null,
      supervisorName: r.supervisor.fullName,
      // The response row is tied to the supervisor's visit (activation), so the
      // visit's promoter is known even for outlet-level photo tasks.
      promoterName: r.activation.staff.fullName,
      outletName: r.activation.outlet.name,
      category: r.task.category,
      taskType: r.task.taskType,
      task: r.task.task,
      rating: r.rating,
      feedback: r.feedback,
      photos: r.photos
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((p) => ({ url: p.url, uploadedAt: p.createdAt })),
    }));
    res.json(okList(shaped, total));
  })
);

// Score summary + incomplete-visit flag for the Task Results page: average
// rating overall / per promoter / per outlet / per category, and the visits
// whose checklist isn't fully answered. Only `range` tasks carry ratings.
router.get(
  "/campaigns/:campaignId/supervisor-task-summary",
  requireCampaignAccess,
  asyncHandler(async (req, res) => {
    const { dateFrom, dateTo, outletId } = req.query as { dateFrom?: string; dateTo?: string; outletId?: string };
    if (outletId) assertOutletAllowed(req, outletId);
    const { responses, visits } = await loadChecklistData({
      campaignId: req.params.campaignId,
      from: dateFrom ? dayDate(dateFrom) : undefined,
      to: dateTo ? dayDate(dateTo) : undefined,
      outletIds: outletIdsAllowed(req),
      outletId,
    });

    const rated = responses.filter((r) => r.rating != null);
    const group = <K extends string>(keyOf: (r: (typeof rated)[number]) => { key: K; extra: Record<string, unknown> }) => {
      const groups = new Map<K, { extra: Record<string, unknown>; values: number[] }>();
      for (const r of rated) {
        const { key, extra } = keyOf(r);
        const g = groups.get(key) ?? { extra, values: [] };
        g.values.push(r.rating as number);
        groups.set(key, g);
      }
      return [...groups.values()].map((g) => ({ ...g.extra, average: average(g.values), ratings: g.values.length }));
    };

    const incompleteVisits = visits
      .filter((v) => v.answered < v.total)
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .map((v) => ({
        date: v.date, visitNo: v.visitNo, outletName: v.outletName, promoterName: v.promoterName, supervisorName: v.supervisorName,
        answered: v.answered, total: v.total,
      }));

    res.json(
      ok({
        overall: { average: average(rated.map((r) => r.rating as number)), ratings: rated.length },
        byPromoter: group((r) => ({ key: r.activation.staffId, extra: { staffId: r.activation.staffId, name: r.activation.staff.fullName } })),
        byOutlet: group((r) => ({ key: r.outletId, extra: { outletId: r.outletId, outletName: r.activation.outlet.name } })),
        byCategory: group((r) => ({ key: r.task.category, extra: { category: r.task.category } })),
        visits: { total: visits.length, complete: visits.length - incompleteVisits.length, incomplete: incompleteVisits.length },
        incompleteVisits,
      })
    );
  })
);

router.delete(
  "/campaigns/:campaignId/supervisor-tasks/:id",
  requireCampaignAccess,
  requireRole("adm", "usr"),
  asyncHandler(async (req, res) => {
    const existing = await prisma.supervisorTask.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.deletedAt || existing.campaignId !== req.params.campaignId) throw notFound("Supervisor task");
    await prisma.supervisorTask.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
    res.json(ok({ ...existing, deletedAt: new Date(), softDeleted: true }));
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
    const day = dayDate(date);

    const activations = await prisma.activation.findMany({
      where: {
        campaignId: req.params.campaignId,
        dateFrom: { lte: day },
        dateTo: { gte: day },
        ...(outletId ? { outletId } : allowed ? { outletId: { in: allowed } } : {}),
      },
      include: { outlet: true, staff: true, attendanceRecords: { where: { date: day } } },
    });

    // Computed PER STAFF, not per activation (issue #33): the global
    // one-open-shift lock (§5.1) means a staff member can only ever check in on
    // ONE of their activations for the day, so treating each activation in
    // isolation marked staff who HAD checked in as absent for their other
    // concurrent activations. A staff member is absent only if NONE of their
    // activations covering `date` has a check-in that day.
    const byStaff = new Map<string, { activations: typeof activations; first: (typeof activations)[number] }>();
    for (const a of activations) {
      const entry = byStaff.get(a.staffId);
      if (entry) entry.activations.push(a);
      else byStaff.set(a.staffId, { activations: [a], first: a });
    }

    const absent = [...byStaff.values()].map(({ activations: staffActivations, first }) => {
      // Only the promoter's own record counts — a covering supervisor's check-in on the same activation doesn't make them present.
      const records = staffActivations.map((a) => a.attendanceRecords.find((r) => r.staffId === a.staffId)).filter(Boolean);
      const checkedIn = records.some((r) => r!.checkInAt);
      return {
        activationId: first.id,
        activationName: first.name,
        outletId: first.outletId,
        outletName: first.outlet.name,
        staffId: first.staffId,
        staffName: first.staff.fullName,
        onLeave: records.some((r) => r!.status === "leave"),
        checkedIn,
      };
    }).filter((row) => !row.checkedIn && !row.onLeave)
      .map(({ checkedIn, ...row }) => row);
    // Computed in memory from full-day activations — page it by slicing (no
    // DB-level skip/take possible).
    const paged = paginate(req);
    res.json(okList(absent.slice(paged.skip, paged.skip + paged.take), absent.length));
  })
);

// ---- Outlet Attendance — supervisor visit log: the attendance rows supervisors
// themselves created (record staff = a supervisor), whether they visit as the
// covering supervisor of a promoter's activation or as the activation's staff. ----
router.get(
  "/campaigns/:campaignId/outlet-attendance",
  requireCampaignAccess,
  asyncHandler(async (req, res) => {
    const { date, outletId } = req.query as { date?: string; outletId?: string };
    if (outletId) assertOutletAllowed(req, outletId);
    const allowed = outletIdsAllowed(req);
    const where: Record<string, unknown> = {
      staff: { is: { userType: "supervisor" } },
      activation: {
        campaignId: req.params.campaignId,
        ...(outletId ? { outletId } : allowed ? { outletId: { in: allowed } } : {}),
      },
    };
    if (date) where.date = dayDate(date);
    const paged = paginate(req);
    const [rows, total] = await Promise.all([
      prisma.attendanceRecord.findMany({
        where,
        include: { staff: true, activation: { include: { staff: true, outlet: true } } },
        orderBy: { date: "desc" },
        ...paged,
      }),
      prisma.attendanceRecord.count({ where }),
    ]);
    const shaped = rows.map((r) => ({
      id: r.id,
      supervisorName: r.staff.fullName,
      staffName: r.staff.fullName,
      outletName: r.activation.outlet.name,
      date: r.date,
      visitNo: r.visitNo,
      checkInAt: r.checkInAt,
      checkOutAt: r.checkOutAt,
    }));
    res.json(okList(shaped, total));
  })
);

// ---- GPS breadcrumb history ----
// Raw TrackingPing trail. Campaign-scoped like tracking/live (§5.9), split
// promoter vs supervisor by the activation's staff.
async function trackingHistory(req: any, userType: "promoter" | "supervisor") {
  const { staffId, date, outletId } = req.query as { staffId?: string; date?: string; outletId?: string };
  if (outletId) assertOutletAllowed(req, outletId);
  const allowed = outletIdsAllowed(req);

  const dateFilter = date ? dayBounds(date) : undefined;

  // The trail belongs to whoever sent the pings (ping.staff), not to the activation's promoter.
  const where = {
    ...(dateFilter ? { capturedAt: dateFilter } : {}),
    staff: { is: { userType, ...(staffId ? { id: staffId } : {}) } },
    activation: {
      campaignId: req.params.campaignId,
      ...(outletId ? { outletId } : allowed ? { outletId: { in: allowed } } : {}),
    },
  };
  const paged = paginate(req);
  const [rows, total] = await Promise.all([
    prisma.trackingPing.findMany({
      where,
      include: { staff: true, activation: { include: { outlet: true } } },
      orderBy: { capturedAt: "asc" },
      ...paged,
    }),
    prisma.trackingPing.count({ where }),
  ]);
  const data = rows.map((p) => ({
    id: p.id,
    staffId: p.staffId,
    staffName: p.staff.fullName,
    outletName: p.activation.outlet.name,
    latitude: p.latitude,
    longitude: p.longitude,
    accuracyMeters: p.accuracyMeters,
    capturedAt: p.capturedAt,
    appState: p.appState,
  }));
  return { data, total };
}

router.get(
  "/campaigns/:campaignId/tracking/promoter-history",
  requireCampaignAccess,
  asyncHandler(async (req, res) => {
    const { data, total } = await trackingHistory(req, "promoter");
    res.json(okList(data, total));
  })
);

router.get(
  "/campaigns/:campaignId/tracking/supervisor-history",
  requireCampaignAccess,
  asyncHandler(async (req, res) => {
    const { data, total } = await trackingHistory(req, "supervisor");
    res.json(okList(data, total));
  })
);

export default router;
