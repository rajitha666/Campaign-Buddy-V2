/**
 * Date/time formatting helpers.
 *
 * The backend's `@db.Date` columns (attendance `date`, leave `fromDate`/`toDate`,
 * …) arrive as `"YYYY-MM-DDT00:00:00.000Z"`. Formatting those with the device
 * locale treats midnight-UTC as local time, so a negative-offset device shows
 * the previous day. `formatDay` pins them to UTC. Real instants (`checkInAt`,
 * `capturedAt`, …) are not date-only — keep formatting those in local time.
 */
const DEFAULT_DAY_OPTS: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };

export function formatDay(iso: string, opts: Intl.DateTimeFormatOptions = DEFAULT_DAY_OPTS): string {
  return new Date(iso).toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' });
}

/** UTC day-of-month for a date-only ISO string. */
export function dayOfMonth(iso: string): number {
  return new Date(iso).getUTCDate();
}

/** "YYYY-MM-DD" for today (or a given Date), for date-input state and API bodies. */
export function ymd(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}
