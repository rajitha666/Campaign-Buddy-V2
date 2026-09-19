// Issue #51 — sales updates must not be saved before the rep checks in.
// Shared guard for the mobile sales-data endpoints (PATCH /stats/today,
// PATCH /products/:id/stock, PATCH + POST confirm /sales-summary/today).
import { dayDate } from "./dates";
import { prisma } from "./prisma";
import { ApiError } from "./apiResponse";

/**
 * Throws 422 NOT_CHECKED_IN unless the activation's own promoter has an open
 * shift today. Sales entry is the promoter's, so a covering supervisor's
 * check-in on the same activation must not unlock it.
 *
 * A write the mobile app recorded offline can reach the server after the shift
 * has closed (the rep's own check-out, or the end-of-day auto-checkout). The app
 * sends `capturedAt` — when the edit was really made — and such a write is
 * accepted if that moment falls INSIDE the shift. Without `capturedAt`, or from
 * outside the shift, a closed shift still refuses.
 */
export async function requireOpenShift(activation: { id: string; staffId: string }, capturedAt?: string) {
  const record = await prisma.attendanceRecord.findUnique({
    where: { activationId_staffId_date: { activationId: activation.id, staffId: activation.staffId, date: dayDate() } },
  });
  if (!record?.checkInAt) throw notCheckedIn();
  if (!record.checkOutAt) return;
  const at = capturedAt ? new Date(capturedAt) : null;
  const insideShift = !!at && !Number.isNaN(at.getTime()) && at >= record.checkInAt && at <= record.checkOutAt;
  if (!insideShift) throw notCheckedIn();
}

const notCheckedIn = () => new ApiError(422, "NOT_CHECKED_IN", "You need to check in before entering sales data");

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
