import { dayDate } from "./dates";

export type ActivationTypeValue = "weekend" | "monthly";

// Client doc B — an activation's type governs which calendar days count
// towards its day counters and target proration: "weekend" activations run
// Sat/Sun only, "monthly" ones Mon-Fri (same weekday definition #53 already
// uses for the mobile day counter). Unlike #53's workingDaysBetween, 0 is a
// valid answer here (e.g. querying before the period has started) — the
// caller decides how to handle that, so this never clamps to 1.
export function countActivationWorkingDays(from: Date, to: Date, activationType: ActivationTypeValue): number {
  const t0 = dayDate(from.toISOString()).getTime();
  const t1 = dayDate(to.toISOString()).getTime();
  if (t1 < t0) return 0;
  let count = 0;
  for (let t = t0; t <= t1; t += 86400000) {
    const dow = new Date(t).getUTCDay();
    const isWeekendDay = dow === 0 || dow === 6;
    if (activationType === "weekend" ? isWeekendDay : !isWeekendDay) count++;
  }
  return count;
}

// The fixed monthly working-day capacity the client specified for proration:
// 8 weekend days/month, 25 working days/month.
export function workingDaysPerMonth(activationType: ActivationTypeValue): number {
  return activationType === "weekend" ? 8 : 25;
}
