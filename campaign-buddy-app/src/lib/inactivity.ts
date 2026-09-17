/** How long the app can go untouched before the rep is signed out. */
export const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Pure elapsed-time check so the auto-logout rule is unit-testable without
 * the RN runtime (see useInactivityLogout.ts for the timer/AppState wiring).
 * `now < lastActiveAt` (device clock moved backwards) is naturally treated
 * as "not exceeded" rather than needing a special case.
 */
export function hasExceededInactivityTimeout(
  lastActiveAt: number,
  now: number,
  timeoutMs: number = INACTIVITY_TIMEOUT_MS
): boolean {
  return now - lastActiveAt >= timeoutMs;
}
