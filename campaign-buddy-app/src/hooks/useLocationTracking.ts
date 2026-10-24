/**
 * Implements spec §5 "POST /location/ping — foreground location tracking"
 * to the letter:
 *
 *  - Checks the GPS every 60s while the app is in the foreground AND the rep
 *    is checked in, but only uploads a ping when the rep has really moved
 *    (beyond the GPS's own error, min 40m) or a 5-minute heartbeat is due.
 *    While the rep stays put the checks back off to every 2 then 5 minutes
 *    (battery); the first sign of movement returns them to every 60s.
 *  - Sends one immediately when the app comes back to the foreground
 *    (if still checked in) — unless a ping was captured under 45s ago, in
 *    which case the GPS isn't even woken (no duplicate rows).
 *  - Stops entirely — no timer running at all — the moment the app is
 *    backgrounded, or the rep checks out. Backgrounding does not end the
 *    shift; it just pauses pings until foregrounded again.
 *  - Never sends a ping outside a check-in/check-out window, even if the
 *    app is open (e.g. before a shift starts).
 *  - With no signal, pings are kept on the phone with their capture time and
 *    uploaded by the sync engine later (offline/pingBuffer.ts).
 *
 * Mount this ONCE near the root of the authenticated app (see App.tsx) —
 * not per-screen — so it keeps running correctly as the user navigates.
 * It reacts to `useAttendance().checkedIn`, so it doesn't need its own
 * copy of that state.
 */
import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Location from 'expo-location';
import * as Battery from 'expo-battery'; // optional — remove if you don't want the battery dependency
import { useAttendance } from '@/context/AttendanceContext';
import { sendLocationPing } from '@/api/location';
import { useNetwork } from '@/offline/NetworkContext';
import { addPing } from '@/offline/pingBuffer';
import { isRetryable } from '@/offline/networkError';
import * as queue from '@/offline/queue';
import { decidePing, nextCheckDelayMs, tooSoon, type LastPing } from '@/lib/pingPolicy';

export function useLocationTracking() {
  const { checkedIn } = useAttendance();
  const { isOnline } = useNetwork();
  const onlineRef = useRef(isOnline);
  onlineRef.current = isOnline;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Survives a background pause (so resuming doesn't double-ping); cleared when the shift ends.
  const lastRef = useRef<LastPing | null>(null);
  const stationaryRef = useRef(0);
  const busyRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!checkedIn) lastRef.current = null;
    let cancelled = false;

    /** One GPS check. Returns whether the rep looks to be moving (drives the poll interval). */
    async function check(force: boolean) {
      if (busyRef.current) return; // a slow fix must not overlap the next one
      if (tooSoon(lastRef.current, Date.now())) return; // already captured moments ago — skip the GPS fix too
      busyRef.current = true;
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return; // silently skip — don't nag the user from a background timer

        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled) return;
        const now = Date.now();
        const fix = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy ?? undefined,
        };
        const { send, moved } = decidePing({ last: lastRef.current, fix, now, force });
        stationaryRef.current = moved ? 0 : stationaryRef.current + 1;
        if (!send) return;

        let batteryPercent: number | undefined;
        try {
          const level = await Battery.getBatteryLevelAsync();
          batteryPercent = Math.round(level * 100);
        } catch {
          // Battery API can be unavailable on some devices/emulators — optional field, just omit it.
        }

        const ping = { ...fix, timestamp: new Date(now).toISOString(), batteryPercent };
        // Mark it captured up front so a resume right now can't send a second copy while this uploads.
        lastRef.current = { ...fix, at: now };
        // No signal — or a check-in still queued (the server refuses pings until it has one): keep
        // the ping, with its capture time, and the sync engine uploads it later. No hole in the trail.
        const checkInQueued = () => queue.list().then((items) => items.some((i) => i.kind === 'checkIn' && i.status === 'pending'));
        if (!onlineRef.current || (await checkInQueued().catch(() => false))) {
          await addPing(ping).catch(() => {});
          return;
        }
        try {
          await sendLocationPing(ping);
        } catch (err) {
          // Fire-and-forget per spec §5 — don't surface to the user. A dropped connection
          // is kept for the sync engine; anything else is retried on a later check.
          if (isRetryable(err)) await addPing(ping).catch(() => {});
          else lastRef.current = null;
        }
      } catch {
        // GPS unavailable / timed out — try again on the next check.
      } finally {
        busyRef.current = false;
      }
    }

    // Self-rescheduling (not setInterval) so the delay can grow while the rep is stationary.
    // `run` identifies one start→stop stretch, so a check that finishes after a stop (or a
    // stop/start) can't leave a second timer chain behind.
    let run = 0;
    let running = false;
    function scheduleNext(id: number) {
      if (cancelled || !running || id !== run) return;
      timerRef.current = setTimeout(async () => {
        await check(false);
        scheduleNext(id);
      }, nextCheckDelayMs(stationaryRef.current));
    }

    function startTimer() {
      if (running) return; // already running
      running = true;
      const id = ++run;
      stationaryRef.current = 0;
      check(true).finally(() => scheduleNext(id)); // immediate check on start
    }

    function stopTimer() {
      running = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }

    // Decide whether the timer SHOULD be running right now.
    function sync() {
      const isForeground = appStateRef.current === 'active';
      if (checkedIn && isForeground) {
        startTimer();
      } else {
        stopTimer();
      }
    }

    const subscription = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
      sync();
    });

    sync(); // evaluate immediately when `checkedIn` changes too

    return () => {
      cancelled = true;
      subscription.remove();
      stopTimer();
    };
  }, [checkedIn]);
}
