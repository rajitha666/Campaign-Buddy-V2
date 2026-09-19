import cron, { ScheduledTask } from "node-cron";
import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../utils/prisma";
import { resolveShiftEnd } from "../utils/attendanceWindow";
import { dayDate } from "../utils/dates";

// Issue #32 — automatic check-out at end of day.
//
// Nothing previously recorded a check-out for staff who never pressed
// "Check out" (crash, dead battery, forgot) — the only relief was the lazy
// stale-shift cleanup inside the NEXT check-in. That left days where a staff
// member had no check-out on record at all. This job closes every open shift
// once a day, setting `checkOutAt` to the effective shift end (the
// activation's own override, else its campaign's configured shift, else the
// ideal end-of-shift fallback — see attendanceWindow.ts). A shift whose
// configured end-time would produce a future checkOutAt is checked out at the
// run time instead.

export async function closeOpenShifts(
  now: Date = new Date(),
  client: PrismaClient | Prisma.TransactionClient = prisma,
  opts: { beforeToday?: boolean } = {}
): Promise<number> {
  const open = await client.attendanceRecord.findMany({
    where: {
      checkInAt: { not: null },
      checkOutAt: null,
      // Boot catch-up: only shifts from earlier days. Today's may be live (issue #83).
      ...(opts.beforeToday ? { date: { lt: dayDate(now.toISOString()) } } : {}),
    },
    include: { activation: { select: { shiftEndMinutes: true, campaign: { select: { shiftEndMinutes: true } } } } },
  });

  let closed = 0;
  for (const rec of open) {
    const end = resolveShiftEnd(rec.activation, rec.activation.campaign, rec.date);
    const checkOutAt = end.getTime() > now.getTime() ? now : end;
    await client.attendanceRecord.update({ where: { id: rec.id }, data: { checkOutAt } });
    closed += 1;
  }
  return closed;
}

/** Boot catch-up: backfill earlier days' missed check-outs without touching shifts open right now. */
export const closeAbandonedShifts = (now: Date = new Date()) => closeOpenShifts(now, prisma, { beforeToday: true });

let task: ScheduledTask | null = null;

// Wired from server.ts only (never app.ts) so importing the Express app in
// tests doesn't spawn a timer. Set AUTO_CHECKOUT_DISABLED=1 to opt out.
export function startAutoCheckoutJob(): void {
  if (process.env.AUTO_CHECKOUT_DISABLED === "1") return;
  if (task) return;

  // Catch-up run on boot so a restarted server backfills yesterday's misses —
  // previous days only: a restart mid-shift must not check anyone out (#83).
  closeAbandonedShifts().catch((err) => console.error("[auto-checkout] boot run failed:", err));

  // 23:55 every day, Asia/Colombo — end of day, before the calendar rolls over.
  task = cron.schedule(
    "55 23 * * *",
    () => {
      closeOpenShifts()
        .then((n) => console.log(`[auto-checkout] closed ${n} open shift(s)`))
        .catch((err) => console.error("[auto-checkout] scheduled run failed:", err));
    },
    { timezone: "Asia/Colombo" }
  );
}
