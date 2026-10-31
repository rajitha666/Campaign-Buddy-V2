// How fresh a staff member's last GPS ping is. The mobile app backs off to one
// ping per 5 minutes while a rep stands still, so an "old" position is normal;
// only flag it once well past that heartbeat (missed beats = no signal, app
// closed or phone off).
// Must stay above the app's stationary heartbeat (HEARTBEAT_MS in
// campaign-buddy-app/src/lib/pingPolicy.ts) — about two missed beats.
export const STALE_AFTER_MS = 12 * 60_000;

export function lastSeenLabel(capturedAt, now = Date.now()) {
  if (!capturedAt) return 'No position yet';
  const ms = now - new Date(capturedAt).getTime();
  if (Number.isNaN(ms)) return 'No position yet';
  const min = Math.floor(Math.max(0, ms) / 60_000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  return `${h} h ${min % 60} min ago`;
}

export function isStale(capturedAt, now = Date.now()) {
  if (!capturedAt) return false;
  const ms = now - new Date(capturedAt).getTime();
  return !Number.isNaN(ms) && ms > STALE_AFTER_MS;
}
