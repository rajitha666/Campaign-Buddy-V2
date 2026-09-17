// Issue #51 — sales updates must not be saved before the rep checks in.
// Shared guard for the mobile sales-data endpoints (PATCH /stats/today,
// PATCH /products/:id/stock, PATCH + POST confirm /sales-summary/today).
import { dayDate } from "./dates";
import { prisma } from "./prisma";
import { ApiError } from "./apiResponse";

/** Throws 422 NOT_CHECKED_IN unless this activation has an open shift today. */
export async function requireOpenShift(activation: { id: string }) {
  const record = await prisma.attendanceRecord.findUnique({
    where: { activationId_date: { activationId: activation.id, date: dayDate() } },
  });
  if (!record?.checkInAt || record.checkOutAt) {
    throw new ApiError(422, "NOT_CHECKED_IN", "You need to check in before entering sales data");
  }
}

/**
 * Confirm variant: requires the rep to have checked in at some point today,
 * but allows the shift to already be closed — otherwise a rep who checks out
 * without confirming could never confirm the day (checkout is not forced
 * through the confirmation sheet).
 */
export async function requireCheckedInToday(activation: { id: string }) {
  const record = await prisma.attendanceRecord.findUnique({
    where: { activationId_date: { activationId: activation.id, date: dayDate() } },
  });
  if (!record?.checkInAt) {
    throw new ApiError(422, "NOT_CHECKED_IN", "You need to check in before entering sales data");
  }
}

// Issue #53 — performance day counters must reflect working days, since
// outlets are closed on weekends. Counts Mon–Fri inclusive; weekend-only
// ranges clamp to 1 so "Day X of Y" never shows 0.
export function workingDaysBetween(from: Date, to: Date): number {
  const t0 = dayDate(from.toISOString()).getTime();
  const t1 = dayDate(to.toISOString()).getTime();
  if (t1 < t0) return 0;
  let count = 0;
  for (let t = t0; t <= t1; t += 86400000) {
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return Math.max(count, 1);
}
