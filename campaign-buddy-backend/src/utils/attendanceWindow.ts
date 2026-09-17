// Issue #31, extended by the per-campaign shift window enhancement.
//
// Every Campaign carries a default shift window (Campaign.shiftStartMinutes /
// shiftEndMinutes, minutes since midnight local time — defaults 540/1080 =
// 09:00-18:00, admin-editable). An Activation may override it with its own
// shiftStartMinutes/shiftEndMinutes; null on the activation means "inherit
// the campaign's default". late/on-time flagging and end-of-day auto
// check-out (#32) both resolve through `resolveShiftStart`/`resolveShiftEnd`
// below. Campaigns run on Asia/Colombo in practice (Campaign.timezone
// defaults to it — see src/utils/licensePeriods.ts); Colombo is a fixed
// UTC+05:30 with no DST, so a fixed-offset shift is exact. `record.date` is
// the @db.Date UTC-midnight day key (src/utils/dates.ts) — resolving against
// that same day, rather than storing an absolute timestamp, is what makes the
// shift apply correctly on every day of a multi-day activation.

const COLOMBO_OFFSET_MIN = 5 * 60 + 30;

// Last-resort fallback, only reached if an Activation somehow has no Campaign
// (shouldn't happen — campaignId is required). Matches the original issue #31
// window; the real default customers see is Campaign.shiftStartMinutes/EndMinutes.
export const IDEAL_CHECK_IN_HOUR = 9;
export const IDEAL_CHECK_OUT_HOUR = 17;

// Wall-clock Colombo time on the calendar day of a @db.Date UTC-midnight key,
// as a real (UTC) Date, from a minutes-since-midnight value.
function colomboTimeOnDay(date: Date, minutesSinceMidnight: number): Date {
  return new Date(date.getTime() + (minutesSinceMidnight - COLOMBO_OFFSET_MIN) * 60_000);
}

export function idealShiftStart(recordDate: Date): Date {
  return colomboTimeOnDay(recordDate, IDEAL_CHECK_IN_HOUR * 60);
}

export function idealShiftEnd(recordDate: Date): Date {
  return colomboTimeOnDay(recordDate, IDEAL_CHECK_OUT_HOUR * 60);
}

type ShiftOverride = { shiftStartMinutes?: number | null; shiftEndMinutes?: number | null };
type ShiftDefault = { shiftStartMinutes?: number; shiftEndMinutes?: number } | null | undefined;

// Resolves both ends of the effective shift for a given Activation on a given
// day: the activation's own override for each end, else its campaign's
// default, else the hardcoded ideal window. If the resolved end time falls at
// or before the resolved start time (an overnight shift, e.g. 22:00-06:00),
// the end rolls over to the following calendar day — otherwise an overnight
// shift's end would resolve to a time earlier the same day.
function resolveShiftWindow(activation: ShiftOverride, campaign: ShiftDefault, recordDate: Date): { start: Date; end: Date } {
  const startMinutes = activation.shiftStartMinutes ?? campaign?.shiftStartMinutes ?? IDEAL_CHECK_IN_HOUR * 60;
  const endMinutes = activation.shiftEndMinutes ?? campaign?.shiftEndMinutes ?? IDEAL_CHECK_OUT_HOUR * 60;
  const start = colomboTimeOnDay(recordDate, startMinutes);
  const rawEnd = colomboTimeOnDay(recordDate, endMinutes);
  const end = rawEnd.getTime() <= start.getTime() ? new Date(rawEnd.getTime() + 24 * 60 * 60_000) : rawEnd;
  return { start, end };
}

export function resolveShiftStart(activation: ShiftOverride, campaign: ShiftDefault, recordDate: Date): Date {
  return resolveShiftWindow(activation, campaign, recordDate).start;
}

export function resolveShiftEnd(activation: ShiftOverride, campaign: ShiftDefault, recordDate: Date): Date {
  return resolveShiftWindow(activation, campaign, recordDate).end;
}

// Late/on-time vs. shiftStart + grace period (Spec §5.6). Exactly at the grace
// deadline is still on time.
export function checkInStatus(
  shiftStart: Date,
  now: Date,
  gracePeriodMinutes = GRACE_PERIOD_MINUTES
): "on_time" | "late" {
  const graceDeadline = shiftStart.getTime() + gracePeriodMinutes * 60_000;
  return now.getTime() > graceDeadline ? "late" : "on_time";
}

export const GRACE_PERIOD_MINUTES = 10; // Confirmed v3 — hardcoded, not configurable yet (Spec §5.6/§8)
