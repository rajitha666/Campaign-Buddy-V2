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

/**
 * "YYYY-MM-DD" for today (or a given Date), for date-input state and API
 * bodies. Uses the Colombo calendar (Campaign.timezone default; fixed
 * UTC+5:30, no DST — same convention as the backend's dayDate()), NOT the
 * device's UTC day: a Sri Lankan user opening the app 00:00–05:30 local would
 * otherwise send yesterday.
 */
const COLOMBO_OFFSET_MIN = 5 * 60 + 30;

export function ymd(d: Date = new Date()): string {
  return new Date(d.getTime() + COLOMBO_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}
