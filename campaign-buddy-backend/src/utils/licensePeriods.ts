import { LicenseUsagePeriod } from "@prisma/client";

// Period boundaries for license-usage snapshots.
//
// Snapshots are bucketed by the campaign's local calendar in Asia/Colombo — the
// only timezone campaigns use in practice (Campaign.timezone defaults to it and
// the rest of the system already assumes it). Colombo is a fixed UTC+05:30 with
// no DST, so a fixed-offset shift is exact; a general-purpose tz library would
// be overkill here. The returned Date is UTC-midnight of the period's first day,
// matching the `@db.Date` storage convention used everywhere else (see
// src/utils/dates.ts).

const COLOMBO_OFFSET_MIN = 5 * 60 + 30;

function colomboParts(now: Date): { y: number; m: number; d: number; isoDow: number } {
  const shifted = new Date(now.getTime() + COLOMBO_OFFSET_MIN * 60_000);
  const dow = shifted.getUTCDay(); // 0 = Sunday
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth(),
    d: shifted.getUTCDate(),
    isoDow: dow === 0 ? 7 : dow, // Monday = 1 … Sunday = 7
  };
}

// Monday (ISO week start) of the week containing `now`, as a UTC-midnight Date.
export function weekStart(now: Date = new Date()): Date {
  const { y, m, d, isoDow } = colomboParts(now);
  return new Date(Date.UTC(y, m, d - (isoDow - 1)));
}

// First day of the month containing `now`, as a UTC-midnight Date.
export function monthStart(now: Date = new Date()): Date {
  const { y, m } = colomboParts(now);
  return new Date(Date.UTC(y, m, 1));
}

export function periodStart(period: LicenseUsagePeriod, now: Date = new Date()): Date {
  return period === "week" ? weekStart(now) : monthStart(now);
}

export const LICENSE_PERIODS: LicenseUsagePeriod[] = ["week", "month"];
