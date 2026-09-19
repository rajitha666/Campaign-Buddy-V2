/**
 * Signs the rep out after INACTIVITY_TIMEOUT_MS of no touches anywhere in
 * the app — a lost or shared device shouldn't stay signed in indefinitely.
 * Backgrounding counts too: elapsed wall-clock time is re-checked on
 * foreground resume rather than trusting the setTimeout alone, since timers
 * are throttled/paused while the app is backgrounded on both platforms.
 *
 * Returned `recordActivity` is meant to be wired to `onTouchStart` on a
 * single wrapping View at the root of the authenticated app (see
 * AuthenticatedApp.tsx) — that catches every tap/scroll/drag without
 * interfering with the Pressables underneath.
 */
import { useCallback, useEffect, useRef } from 'react';
import { AppState, Alert, type AppStateStatus } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { INACTIVITY_TIMEOUT_MS, hasExceededInactivityTimeout } from '@/lib/inactivity';

const SUSPENDED_RECHECK_MS = 30_000;

export function useInactivityLogout({
  suspended = false,
  beforeSignOut,
}: { suspended?: boolean; beforeSignOut?: () => Promise<void> } = {}) {
  const { logout } = useAuth();
  const lastActiveAt = useRef(Date.now());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // While suspended (offline mid-shift — the rep couldn't log back in) the sign-out
  // is deferred; it fires on the next check once they're back online or checked out.
  const suspendedRef = useRef(suspended);
  suspendedRef.current = suspended;

  const signOutForInactivity = useCallback(async () => {
    // Give anything still waiting to sync a last chance to reach the server.
    await beforeSignOut?.().catch(() => {});
    await logout();
    Alert.alert('Signed out', "You've been signed out after 5 minutes of inactivity. Please log in again.");
  }, [logout, beforeSignOut]);

  const scheduleCheck = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    const remaining = Math.max(INACTIVITY_TIMEOUT_MS - (Date.now() - lastActiveAt.current), 0);
    timer.current = setTimeout(() => {
      if (!hasExceededInactivityTimeout(lastActiveAt.current, Date.now())) {
        scheduleCheck();
      } else if (suspendedRef.current) {
        timer.current = setTimeout(scheduleCheck, SUSPENDED_RECHECK_MS);
      } else {
        signOutForInactivity();
      }
    }, remaining);
  }, [signOutForInactivity]);

  const recordActivity = useCallback(() => {
    lastActiveAt.current = Date.now();
    scheduleCheck();
  }, [scheduleCheck]);

  useEffect(() => {
    scheduleCheck();
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next !== 'active') return;
      if (!hasExceededInactivityTimeout(lastActiveAt.current, Date.now())) {
        recordActivity();
      } else if (!suspendedRef.current) {
        signOutForInactivity();
      }
    });
    return () => {
      sub.remove();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [scheduleCheck, recordActivity, signOutForInactivity]);

  return recordActivity;
}
