import { Router } from "express";
import bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ok, okList, notFound, validationError, ApiError } from "../../utils/apiResponse";
import { requireRole } from "../../middleware/userAuth";
import { validate } from "../../middleware/validate";
import { s } from "../../schemas";
import { normalizeLkPhone } from "../../utils/phone";

const router = Router();

// The Staff HR field set is fixed for v3 (schema comment / Changelog v3 "Staff HR
// fields"). Whitelist writes to these columns so a portal form that posts extra
// keys gets them ignored rather than 500-ing Prisma.
const STAFF_WRITABLE = [
  "employeeId", "fullName", "displayName", "userType", "mobileUsername",
  "phone", "cityId", "status", "reportsToStaffId", "linkedUserId",
  "nic", "dateOfBirth", "gender", "permanentAddress", "currentAddress",
  "emergencyContactName", "emergencyContactPhone",
  "bankAccountName", "bankName", "bankAccountNumber", "bankBranch",
] as const;

// staff.phone is only unique among *active* staff (a partial index — see
// migration 20260915... phone_local_format_and_uniqueness). A plain P2002 from
// the global error handler would report the raw index name; give a readable
// message instead.
async function withActivePhoneConflictAsDuplicate<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ApiError(409, "DUPLICATE", "Another active staff member already uses this phone number", "phone");
    }
    throw err;
  }
}

function pickStaff(body: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  for (const key of STAFF_WRITABLE) {
    if (body[key] === undefined) continue;
    if (key === "dateOfBirth" && body[key]) {
      data[key] = new Date(body[key] as string);
    } else if ((key === "phone" || key === "emergencyContactPhone") && typeof body[key] === "string" && body[key]) {
      // Store in the canonical local SL format so login-by-number matches
      // regardless of how the admin typed it (issue #3, #22).
      data[key] = normalizeLkPhone(body[key] as string) ?? body[key];
    } else {
      data[key] = body[key];
    }
  }
  return data;
}

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
    res.json(okList(rows, total)); // passwordHash omitted globally (src/utils/prisma.ts)
  })
);

router.post(
  "/staff",
  requireRole("adm", "usr"),
  validate({ body: s.staffCreate }),
  asyncHandler(async (req, res) => {
    const { password } = req.body as any;
    if (!password) throw validationError("password is required", "password");
    const passwordHash = await bcrypt.hash(password, Number(process.env.BCRYPT_SALT_ROUNDS || 10));
    const created = await withActivePhoneConflictAsDuplicate(() =>
      prisma.staff.create({ data: { ...pickStaff(req.body), passwordHash } as any })
    );
    res.status(201).json(ok(created)); // passwordHash omitted globally (src/utils/prisma.ts)
  })
);

router.patch(
  "/staff/:id",
  requireRole("adm", "usr"),
  validate({ body: s.staffUpdate }),
  asyncHandler(async (req, res) => {
    const { password } = req.body as any;
    const data: any = pickStaff(req.body);
    if (password) data.passwordHash = await bcrypt.hash(password, Number(process.env.BCRYPT_SALT_ROUNDS || 10));
    const updated = await withActivePhoneConflictAsDuplicate(() =>
      prisma.staff.update({ where: { id: req.params.id }, data })
    );
    res.json(ok(updated)); // passwordHash omitted globally (src/utils/prisma.ts)
  })
);

router.delete(
  "/staff/:id",
  requireRole("adm"),
  asyncHandler(async (req, res) => {
    try {
      await prisma.staff.delete({ where: { id: req.params.id } });
      res.status(204).send();
    } catch (err) {
      // Referenced by activations, attendance, sales history, etc. — this
      // staff member has a real track record, so soft-delete (mark inactive:
      // blocks mobile login, drops out of active pickers) instead of
      // failing with IN_USE (#23).
      if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2003") throw err;
      const updated = await prisma.staff.update({ where: { id: req.params.id }, data: { status: "inactive" } });
      res.json(ok({ ...updated, softDeleted: true })); // passwordHash omitted globally (src/utils/prisma.ts)
    }
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

    const staff = await prisma.staff.findUnique({ where: { id: staffId }, include: { city: true, reportsTo: true } });
    if (!staff) throw notFound("Staff member");

    // Not date-filtered — this is the staff member's full activation history,
    // independent of the evaluation window used for the stats below.
    const activations = await prisma.activation.findMany({
      where: { staffId },
      include: { campaign: true, outlet: true },
      orderBy: { dateFrom: "desc" },
    });
    const activationIds = activations.map((a) => a.id);

    const [attendanceRecords, salesRecords, dailyStats] = await Promise.all([
      prisma.attendanceRecord.findMany({ where: { activationId: { in: activationIds }, date: { gte: from, lte: to } } }),
      prisma.salesRecord.findMany({
        where: { activationItem: { activationId: { in: activationIds } }, date: { gte: from, lte: to } },
        include: { activationItem: { include: { campaignItem: { include: { item: { include: { brand: true } } } } } } },
      }),
      prisma.dailyStats.findMany({ where: { activationId: { in: activationIds }, date: { gte: from, lte: to } } }),
    ]);

    const daysPresent = attendanceRecords.filter((r) => r.status === "on_time" || r.status === "late").length;
    const attendancePct = attendanceRecords.length ? Math.round((daysPresent / attendanceRecords.length) * 100) : 0;

    const totalItems = salesRecords.reduce((s, r) => s + r.soldToday, 0);
    const salesByDay: Record<string, number> = {};
    const salesByBrand: Record<string, number> = {};
    const salesByProduct: Record<string, { name: string; qty: number; value: number }> = {};
    const salesByActivation: Record<string, number> = {};
    let totalSales = 0;
    for (const r of salesRecords) {
      const item = r.activationItem.campaignItem.item;
      const value = r.soldToday * item.unitPrice;
      totalSales += value;
      const dayKey = r.date.toISOString().slice(0, 10);
      salesByDay[dayKey] = (salesByDay[dayKey] ?? 0) + value;
      salesByBrand[item.brand.name] = (salesByBrand[item.brand.name] ?? 0) + value;
      const product = salesByProduct[item.id] ?? { name: item.name, qty: 0, value: 0 };
      product.qty += r.soldToday;
      product.value += value;
      salesByProduct[item.id] = product;
      const activationId = r.activationItem.activationId;
      salesByActivation[activationId] = (salesByActivation[activationId] ?? 0) + value;
    }

    const approachedByActivation: Record<string, number> = {};
    let customersApproached = 0;
    for (const d of dailyStats) {
      customersApproached += d.approached;
      approachedByActivation[d.activationId] = (approachedByActivation[d.activationId] ?? 0) + d.approached;
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

    const topProducts = Object.values(salesByProduct)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    // Overall performance is a simple blended score — attendance + a sales-target-free
    // sales-activity signal. Documented as a placeholder heuristic; refine once a
    // target/quota concept exists to compare totalSales against.
    const overallPerformancePct = Math.round((attendancePct + Math.min(100, totalItems)) / 2);

    const today = new Date();
    const activationsOut = activations.map((a) => ({
      id: a.id,
      campaignId: a.campaignId,
      campaignName: a.campaign.name,
      outletId: a.outletId,
      outletName: a.outlet.name,
      dateFrom: a.dateFrom,
      dateTo: a.dateTo,
      isCurrent: a.dateFrom <= today && today <= a.dateTo,
      sales: salesByActivation[a.id] ?? 0,
      customersApproached: approachedByActivation[a.id] ?? 0,
    }));
    // "Current" = active today; if none is, fall back to the most recently
    // ended activation so the card never sits empty for an idle staff member.
    let currentActivationId = activationsOut.find((a) => a.isCurrent)?.id ?? null;
    if (!currentActivationId) {
      const past = activationsOut
        .filter((a) => a.dateTo < today)
        .sort((a, b) => b.dateTo.getTime() - a.dateTo.getTime());
      currentActivationId = past[0]?.id ?? null;
    }

    res.json(ok({
      profile: {
        id: staff.id, employeeId: staff.employeeId, fullName: staff.fullName, displayName: staff.displayName,
        userType: staff.userType, mobileUsername: staff.mobileUsername, phone: staff.phone,
        cityId: staff.cityId, cityName: staff.city?.name ?? null, status: staff.status,
        reportsToStaffId: staff.reportsToStaffId, reportsToName: staff.reportsTo?.fullName ?? null,
        nic: staff.nic, dateOfBirth: staff.dateOfBirth, gender: staff.gender,
        permanentAddress: staff.permanentAddress, currentAddress: staff.currentAddress,
        emergencyContactName: staff.emergencyContactName, emergencyContactPhone: staff.emergencyContactPhone,
        bankAccountName: staff.bankAccountName, bankName: staff.bankName,
        bankAccountNumber: staff.bankAccountNumber, bankBranch: staff.bankBranch,
      },
      overallPerformancePct, attendancePct, totalSales, totalItems,
      avgSalesPerMonth, highestDailySales, highestPerformingDate, brandContribution,
      topProducts, customersApproached, activations: activationsOut, currentActivationId,
    }));
  })
);

export default router;
