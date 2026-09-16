// Issue #31 — the standard (ideal) shift window: 09:00–17:00 local time.
//
// Activations may omit shiftStart/shiftEnd (both nullable). When they do,
// late/on-time flagging and end-of-day auto check-out (#32) fall back to this
// window instead of having no enforcement at all. Campaigns run on
// Asia/Colombo in practice (Campaign.timezone defaults to it — see
// src/utils/licensePeriods.ts); Colombo is a fixed UTC+05:30 with no DST, so a
// fixed-offset shift is exact. `record.date` is the @db.Date UTC-midnight day
// key (src/utils/dates.ts).

const COLOMBO_OFFSET_MIN = 5 * 60 + 30;

export const IDEAL_CHECK_IN_HOUR = 9;
export const IDEAL_CHECK_OUT_HOUR = 17;

// Wall-clock `hour:minute` Colombo time on the calendar day of a @db.Date
// UTC-midnight key, as a real (UTC) Date.
function colomboTimeOnDay(date: Date, hour: number, minute = 0): Date {
  return new Date(date.getTime() + (hour * 60 + minute - COLOMBO_OFFSET_MIN) * 60_000);
}

export function idealShiftStart(recordDate: Date): Date {
  return colomboTimeOnDay(recordDate, IDEAL_CHECK_IN_HOUR);
}

export function idealShiftEnd(recordDate: Date): Date {
  return colomboTimeOnDay(recordDate, IDEAL_CHECK_OUT_HOUR);
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
