// Surfaces the admin-set ActivationTarget data (see targetProgress.ts for the
// admin-side achieved/percent calc) to the mobile app as a single LKR figure.
// Targets are entered directly in LKR (confirmed — no unit-price conversion
// needed here, unlike targetProgress.ts's unit_wise handling).
import { prisma } from "./prisma";
import { dayDate } from "./dates";

/**
 * Sum of every ActivationTarget whose date range covers `date` (today, by
 * default) — an activation can have several concurrent item/brand targets.
 * `null` when none are active, so callers can hide the Target UI entirely
 * rather than show a misleading 0.
 */
export async function todaysTarget(activationId: string, date: Date = dayDate()): Promise<number | null> {
  const rows = await prisma.activationTarget.findMany({
    where: { activationId, dateFrom: { lte: date }, dateTo: { gte: date } },
  });
  if (rows.length === 0) return null;
  return rows.reduce((sum, row) => sum + row.targetValue, 0);
}

export interface TargetInfo {
  /** The figure to show: the daily target for a daily activation, the monthly target (as entered) for a monthly one. */
  target: number | null;
  targetCategorization: "daily" | "monthly";
  /** How to read `target`: units sold, or LKR of sales. */
  targetUnit: "unit_wise" | "sales_wise";
}

/**
 * What the mobile app should show as the promoter's target. `targetValue` is
 * stored as entered, so both categorisations sum today's active targets; the
 * activation's categorisation says whether that figure is per day or per month.
 */
export async function targetInfo(
  activation: { id: string; targetCategorization: "daily" | "monthly"; targetUnit: "unit_wise" | "sales_wise" },
  date: Date = dayDate()
): Promise<TargetInfo> {
  return {
    target: await todaysTarget(activation.id, date),
    targetCategorization: activation.targetCategorization,
    targetUnit: activation.targetUnit,
  };
}

/**
 * Projects today's active daily target across the activation's full run —
 * inclusive calendar days from dateFrom to dateTo. `null` propagates when
 * there's no active target to project from.
 */
export function totalTargetFromDaily(dailyTarget: number | null, dateFrom: Date, dateTo: Date): number | null {
  if (dailyTarget === null) return null;
  const days = Math.round((dateTo.getTime() - dateFrom.getTime()) / 86_400_000) + 1;
  return dailyTarget * Math.max(days, 1);
}
