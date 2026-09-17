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
