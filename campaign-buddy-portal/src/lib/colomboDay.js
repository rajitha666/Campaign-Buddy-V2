// "YYYY-MM-DD" for the current Colombo calendar day (Campaign.timezone
// default; fixed UTC+5:30, no DST — the same convention the backend uses for
// its day-keyed columns). NOT `new Date().toISOString()`: that is the UTC day,
// so a Sri Lankan user opening the portal 00:00–05:30 local would get
// yesterday's key.
const COLOMBO_OFFSET_MIN = 5 * 60 + 30;

export function colomboYmd() {
  return new Date(Date.now() + COLOMBO_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}

// UTC-midnight Date of the current Colombo calendar day — the same day-key
// convention as the backend's dayDate(). Positional day arithmetic should be
// done off this anchor (`dayDateColombo().getTime() - n * 86400000`) instead
// of raw `Date.now()`, so day buckets stay stable across the 18:30–24:00 UTC
// window (00:00–05:30 Colombo = already the next calendar day).
export function dayDateColombo() {
  return new Date(`${colomboYmd()}T00:00:00.000Z`);
}
