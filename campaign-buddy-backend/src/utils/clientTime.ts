import { dayDate } from "./dates";

// Tolerated device-clock drift ahead of the server before a client time is distrusted.
const FUTURE_SKEW_MS = 2 * 60 * 1000;

/**
 * The moment a promoter actually checked in/out, for actions the mobile app
 * queued while offline and sent later (the app sends `capturedAt` ONLY for
 * those — ordinary online requests keep server time, so a phone with a wrong
 * clock can't skew attendance).
 *
 * Trusted only when it is a valid time, not in the future, and on the same UTC
 * day as `now`: a queued action can move a record earlier within today, never
 * re-date it or store a future time. Anything else falls back to `now`.
 */
export function resolveCapturedAt(raw: string | undefined, now: Date = new Date()): Date {
  if (!raw) return now;
  const captured = new Date(raw);
  if (Number.isNaN(captured.getTime())) return now;
  if (captured.getTime() > now.getTime() + FUTURE_SKEW_MS) return now;
  if (dayDate(captured.toISOString()).getTime() !== dayDate(now.toISOString()).getTime()) return now;
  return captured.getTime() > now.getTime() ? now : captured;
}
