import { Router } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ok, okList, notFound, validationError } from "../../utils/apiResponse";
import { requireRole } from "../../middleware/userAuth";

const router = Router();

// Global staff pool — NOT campaign-scoped. Used across ~8 dropdowns in the portal.
router.get(
  "/staff",
  asyncHandler(async (req, res) => {
    const search = (req.query.search as string) || "";
    const userType = req.query.userType as "promoter" | "supervisor" | undefined;
    const page = Number(req.query.page || 1);
    const pageSize = Number(req.query.pageSize || 25);

    const where = {
      ...(search ? { fullName: { contains: search, mode: "insensitive" as const } } : {}),
      ...(userType ? { userType } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.staff.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, include: { city: true } }),
      prisma.staff.count({ where }),
    ]);
    res.json(okList(rows.map(({ passwordHash, ...s }) => s), total));
  })
);

router.post(
  "/staff",
  requireRole("adm", "usr"),
  asyncHandler(async (req, res) => {
    const { password, ...rest } = req.body as any;
    if (!password) throw validationError("password is required", "password");
    const passwordHash = await bcrypt.hash(password, Number(process.env.BCRYPT_SALT_ROUNDS || 10));
    const created = await prisma.staff.create({ data: { ...rest, passwordHash } });
    const { passwordHash: _omit, ...safe } = created;
    res.status(201).json(ok(safe));
  })
);

router.patch(
  "/staff/:id",
  requireRole("adm", "usr"),
  asyncHandler(async (req, res) => {
    const { password, ...rest } = req.body as any;
    const data: any = { ...rest };
    if (password) data.passwordHash = await bcrypt.hash(password, Number(process.env.BCRYPT_SALT_ROUNDS || 10));
    const updated = await prisma.staff.update({ where: { id: req.params.id }, data });
    const { passwordHash: _omit, ...safe } = updated;
    res.json(ok(safe));
  })
);

// NEW in v3 — folded in from the retired Full Backend Contract §7.7.1 (Spec v3 §4.2).
router.get(
  "/staff/:staffId/evaluation",
  asyncHandler(async (req, res) => {
    const { staffId } = req.params;
    const { dateFrom, dateTo } = req.query as { dateFrom?: string; dateTo?: string };
    const from = dateFrom ? new Date(dateFrom) : new Date(0);
    const to = dateTo ? new Date(dateTo) : new Date();

    const staff = await prisma.staff.findUnique({ where: { id: staffId } });
    if (!staff) throw notFound("Staff member");

    const activations = await prisma.activation.findMany({ where: { staffId } });
    const activationIds = activations.map((a) => a.id);

    const [attendanceRecords, salesRecords] = await Promise.all([
      prisma.attendanceRecord.findMany({ where: { activationId: { in: activationIds }, date: { gte: from, lte: to } } }),
      prisma.salesRecord.findMany({
        where: { activationItem: { activationId: { in: activationIds } }, date: { gte: from, lte: to } },
        include: { activationItem: { include: { campaignItem: { include: { item: { include: { brand: true } } } } } } },
      }),
    ]);

    const daysPresent = attendanceRecords.filter((r) => r.status === "on_time" || r.status === "late").length;
    const attendancePct = attendanceRecords.length ? Math.round((daysPresent / attendanceRecords.length) * 100) : 0;

    const totalItems = salesRecords.reduce((s, r) => s + r.soldToday, 0);
    const salesByDay: Record<string, number> = {};
    const salesByBrand: Record<string, number> = {};
    let totalSales = 0;
    for (const r of salesRecords) {
      const value = r.soldToday * r.activationItem.campaignItem.item.unitPrice;
      totalSales += value;
      const dayKey = r.date.toISOString().slice(0, 10);
      salesByDay[dayKey] = (salesByDay[dayKey] ?? 0) + value;
      const brandName = r.activationItem.campaignItem.item.brand.name;
      salesByBrand[brandName] = (salesByBrand[brandName] ?? 0) + value;
    }

    const daySorted = Object.entries(salesByDay).sort((a, b) => b[1] - a[1]);
    const highestDailySales = daySorted[0]?.[1] ?? 0;
    const highestPerformingDate = daySorted[0]?.[0] ?? null;

    const monthsSpanned = Math.max(1, Math.round((to.getTime() - from.getTime()) / (30 * 86400000)));
    const avgSalesPerMonth = Math.round(totalSales / monthsSpanned);

    const brandContribution = Object.entries(salesByBrand).map(([brandName, value]) => ({
      brandName,
      percent: totalSales ? Math.round((value / totalSales) * 100) : 0,
    }));

    // Overall performance is a simple blended score — attendance + a sales-target-free
    // sales-activity signal. Documented as a placeholder heuristic; refine once a
    // target/quota concept exists to compare totalSales against.
    const overallPerformancePct = Math.round((attendancePct + Math.min(100, totalItems)) / 2);

    res.json(ok({
      overallPerformancePct, attendancePct, totalSales, totalItems,
      avgSalesPerMonth, highestDailySales, highestPerformingDate, brandContribution,
    }));
  })
);

export default router;
