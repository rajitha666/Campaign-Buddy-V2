/**
 * When the location-tracking hook should take a GPS fix and when a fix is worth
 * uploading. Pure functions so the battery/noise rules are unit-tested; the hook
 * (hooks/useLocationTracking.ts) only wires them to timers and the network.
 */

export const MIN_DISTANCE_METERS = 40; // smaller than typical indoor "Balanced" GPS wander
export const MIN_GAP_MS = 45_000; // never two pings closer than this — also skips the GPS fix entirely
// A stationary rep still reports in this often. The portal flags a position stale at 12 min
// (STALE_AFTER_MS in campaign-buddy-portal/src/lib/lastSeen.js) — keep that above this value.
export const HEARTBEAT_MS = 300_000;
const CHECK_STEPS_MS = [60_000, 120_000, HEARTBEAT_MS]; // poll interval as the rep stays put

export interface Fix {
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
}

export interface LastPing extends Fix {
  /** epoch ms the ping was captured */
  at: number;
}

export function distanceMeters(a: Fix, b: Fix): number {
  // Simple haversine — good enough for a "did we move" check.
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** A ping was captured moments ago — don't even wake the GPS for another. */
export function tooSoon(last: LastPing | null, now: number): boolean {
  return !!last && now - last.at < MIN_GAP_MS;
}

/**
 * `force` = the timer just (re)started (check-in, app back in the foreground):
 * send a fresh position even if the rep hasn't moved. It never overrides `tooSoon`.
 * `moved` tells the caller whether to keep polling quickly or back off.
 */
export function decidePing(opts: { last: LastPing | null; fix: Fix; now: number; force: boolean }): {
  send: boolean;
  moved: boolean;
} {
  const { last, fix, now, force } = opts;
  if (!last) return { send: true, moved: true };
  if (tooSoon(last, now)) return { send: false, moved: false };
  // A move only counts once it's bigger than the GPS's own error, else indoor jitter looks like walking.
  const threshold = Math.max(MIN_DISTANCE_METERS, fix.accuracyMeters ?? 0, last.accuracyMeters ?? 0);
  const moved = distanceMeters(last, fix) >= threshold;
  return { send: moved || force || now - last.at >= HEARTBEAT_MS, moved };
}

/** Delay before the next GPS check, given how many checks in a row found the rep stationary. */
export function nextCheckDelayMs(stationaryStreak: number): number {
  const step = stationaryStreak < 2 ? 0 : stationaryStreak < 4 ? 1 : 2;
  return CHECK_STEPS_MS[step];
}
