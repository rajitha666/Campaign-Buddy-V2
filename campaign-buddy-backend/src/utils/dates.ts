// Date helpers for the `@db.Date` columns (AttendanceRecord.date, SalesRecord.date,
// DailyStats.date, SupervisorRoute.dateFrom/dateTo, …).
//
// Prisma stores `@db.Date` keyed by the UTC calendar date and reads it back as
// that date at UTC-midnight (`2026-09-06T00:00:00.000Z`). So every filter against
// these columns — equality OR range — must use a UTC-midnight Date. Parsing a
// "YYYY-MM-DD" as `new Date(str)` already gives UTC midnight; the trap is calling
// `.setHours(0,0,0,0)` on it (that shifts to *local* midnight and, in a
// negative-offset timezone, to the previous day).

// UTC-midnight Date for a "YYYY-MM-DD" string, or for today (UTC) when omitted.
export function dayDate(input?: string): Date {
  const ymd = (input ?? new Date().toISOString()).slice(0, 10);
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
