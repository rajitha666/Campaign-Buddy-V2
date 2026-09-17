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

export function useInactivityLogout() {
  const { logout } = useAuth();
  const lastActiveAt = useRef(Date.now());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const signOutForInactivity = useCallback(async () => {
    await logout();
    Alert.alert('Signed out', "You've been signed out after 5 minutes of inactivity. Please log in again.");
  }, [logout]);

  const scheduleCheck = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    const remaining = Math.max(INACTIVITY_TIMEOUT_MS - (Date.now() - lastActiveAt.current), 0);
    timer.current = setTimeout(() => {
      if (hasExceededInactivityTimeout(lastActiveAt.current, Date.now())) {
        signOutForInactivity();
      } else {
        scheduleCheck();
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
      if (hasExceededInactivityTimeout(lastActiveAt.current, Date.now())) {
        signOutForInactivity();
      } else {
        recordActivity();
      }
    });
    return () => {
      sub.remove();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [scheduleCheck, recordActivity, signOutForInactivity]);

  return recordActivity;
}
