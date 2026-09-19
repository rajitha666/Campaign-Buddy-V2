// Date helpers for the `@db.Date` columns (AttendanceRecord.date, SalesRecord.date,
// DailyStats.date, SupervisorRoute.dateFrom/dateTo, …).
//
// Prisma stores `@db.Date` keyed by the UTC calendar date and reads it back as
// that date at UTC-midnight (`2026-09-06T00:00:00.000Z`). So every filter against
// these columns — equality OR range — must use a UTC-midnight Date. Parsing a
// "YYYY-MM-DD" as `new Date(str)` already gives UTC midnight; the trap is calling
// `.setHours(0,0,0,0)` on it (that shifts to *local* midnight and, in a
// negative-offset timezone, to the previous day).

// Business runs on Asia/Colombo (Campaign.timezone default; fixed UTC+05:30,
// no DST — same convention as attendanceWindow.ts / licensePeriods.ts), so the
// implicit "today" must be the Colombo calendar date, not the container's UTC
// one — otherwise 18:30–24:00 UTC (00:00–05:30 Colombo next day) serves
// yesterday to every mobile route.
const COLOMBO_OFFSET_MIN = 5 * 60 + 30;

// UTC-midnight Date for a "YYYY-MM-DD" string, or for today (Colombo) when
// omitted — still a `@db.Date` UTC-midnight key either way.
export function dayDate(input?: string): Date {
  const now = new Date(Date.now() + COLOMBO_OFFSET_MIN * 60_000);
  const ymd = (input ?? now.toISOString()).slice(0, 10);
  return new Date(`${ymd}T00:00:00.000Z`);
}

// [start, end) UTC-day bounds for a "YYYY-MM-DD" — for filtering full DateTime
// columns (e.g. TrackingPing.capturedAt) to a single calendar day.
export function dayBounds(input: string): { gte: Date; lt: Date } {
  const start = dayDate(input);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { gte: start, lt: end };
}
