/**
 * Implements spec §5 "POST /location/ping — foreground location tracking"
 * to the letter:
 *
 *  - Sends a ping every PING_INTERVAL_MS while the app is in the
 *    foreground AND the rep is checked in.
 *  - Sends one immediately when the app comes back to the foreground
 *    (if still checked in).
 *  - Stops entirely — no timer running at all — the moment the app is
 *    backgrounded, or the rep checks out. Backgrounding does not end the
 *    shift; it just pauses pings until foregrounded again.
 *  - Never sends a ping outside a check-in/check-out window, even if the
 *    app is open (e.g. before a shift starts).
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

const PING_INTERVAL_MS = 60_000; // 60s heartbeat — see spec §5 recommendation
const MIN_DISTANCE_METERS = 10; // skip a ping if we haven't moved much since the last one

function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  // Simple haversine — good enough for a "did we move" check, not for
  // anything requiring survey-grade precision.
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function useLocationTracking() {
  const { checkedIn } = useAttendance();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSentRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    async function sendPingIfWorthIt(force: boolean) {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') return; // silently skip — don't nag the user from a background timer

      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude };

      if (!force && lastSentRef.current) {
        const moved = distanceMeters(lastSentRef.current, coords);
        if (moved < MIN_DISTANCE_METERS) return; // heartbeat still fires on the next interval tick regardless
      }

      let batteryPercent: number | undefined;
      try {
        const level = await Battery.getBatteryLevelAsync();
        batteryPercent = Math.round(level * 100);
      } catch {
        // Battery API can be unavailable on some devices/emulators — optional field, just omit it.
      }

      try {
        await sendLocationPing({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracyMeters: position.coords.accuracy ?? undefined,
          timestamp: new Date().toISOString(),
          batteryPercent,
        });
        lastSentRef.current = coords;
      } catch {
        // Fire-and-forget per spec §5 — just retry on the next tick, don't surface to the user.
      }
    }

    function startTimer() {
      if (intervalRef.current) return; // already running
      sendPingIfWorthIt(true); // immediate ping on start
      intervalRef.current = setInterval(() => sendPingIfWorthIt(false), PING_INTERVAL_MS);
    }

    function stopTimer() {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      lastSentRef.current = null;
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
      subscription.remove();
      stopTimer();
    };
  }, [checkedIn]);
}
