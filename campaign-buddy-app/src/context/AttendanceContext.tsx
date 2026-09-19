/**
 * Single source of truth for "am I currently checked in". This is
 * deliberately its own context (not folded into AuthContext) because
 * useLocationTracking.ts watches `checkedIn` to start/stop GPS pings —
 * see spec §5: pings run ONLY between check-in and check-out.
 *
 * Screens should read `checkedIn` / `checkInAt` from here rather than
 * re-fetching /attendance/today themselves, so the whole app agrees on
 * state the instant check-in or check-out happens.
 *
 * Offline (promoters): a check-in/check-out that can't reach the server is
 * queued with the time it really happened and applied locally straight away;
 * the sync engine sends it in order (check-in first, check-out last) and the
 * server records it at that time. Supervisors stay online-only.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as Location from 'expo-location';
import * as attendanceApi from '@/api/attendance';
import type { AttendanceStatus } from '@/api/types';
import { getCheckoutCoords } from '@/lib/checkoutLocation';
import { getCheckInCoords } from '@/lib/checkInLocation';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/Toast';
import { useNetwork } from '@/offline/NetworkContext';
import { useSyncEngine } from '@/offline/SyncContext';
import { syncedEvents } from '@/offline/events';
import { isRetryable, offlineUnavailableError } from '@/offline/networkError';
import * as queue from '@/offline/queue';
import { loadAttendanceSnapshot, saveAttendanceSnapshot, type AttendanceSnapshot } from '@/offline/sessionSnapshot';

interface AttendanceContextValue {
  checkedIn: boolean;
  /**
   * True once the rep has checked out today — check-in is done for the day
   * (promoters; the backend rejects a re-check-in with ALREADY_CHECKED_OUT).
   * Supervisors still move between outlets, and their re-check-ins reset this.
   */
  checkedOutToday: boolean;
  checkInAt: string | null;
  status: AttendanceStatus | null;
  /**
   * Server-computed geofence result for today's check-in (client doc C) —
   * null before any check-in has happened yet today. Never blocks check-in
   * (soft flag only); screens use it to show a warning, not to gate anything.
   */
  locationVerified: boolean | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  /** Requests location permission + a fresh fix, then calls POST /attendance/check-in (queued if offline). */
  checkIn: (assignmentId: string) => Promise<void>;
  /**
   * `salesSummaryConfirmed` must be true — the checkout confirmation sheet
   * only calls this after the rep has actually confirmed (directly, or via
   * the sales-summary detour). See CheckoutConfirmSheet.tsx.
   * `assignmentId` targets one of a supervisor's several route outlets;
   * promoters omit it. Anything still waiting to sync is sent first.
   */
  checkOut: (assignmentId?: string) => Promise<void>;
}

const AttendanceContext = createContext<AttendanceContextValue | undefined>(undefined);

type ShiftState = Omit<AttendanceSnapshot, 'userId' | 'day'>;

export function AttendanceProvider({ children }: { children: React.ReactNode }) {
  const [checkedIn, setCheckedIn] = useState(false);
  const [checkedOutToday, setCheckedOutToday] = useState(false);
  const [checkInAt, setCheckInAt] = useState<string | null>(null);
  const [status, setStatus] = useState<AttendanceStatus | null>(null);
  const [locationVerified, setLocationVerified] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const { user } = useAuth();
  const userId = user?.id;
  const canQueue = user?.role !== 'campaign_owner'; // supervisors' route check-ins stay online-only
  const { isOnline } = useNetwork();
  const { syncNow, refreshCounts } = useSyncEngine();
  const { showToast } = useToast();

  // Apply a shift state and keep it on the device so an offline cold start knows
  // where the shift stands (AuthContext reads it; see lib/offlineSession.ts).
  const applyState = useCallback(
    (s: ShiftState) => {
      setCheckedIn(s.checkedIn);
      setCheckedOutToday(s.checkedOutToday);
      setCheckInAt(s.checkInAt);
      setStatus(s.status);
      setLocationVerified(s.locationVerified);
      if (userId) saveAttendanceSnapshot({ userId, ...s });
    },
    [userId]
  );

  const refresh = useCallback(async () => {
    try {
      // A check-in/out still waiting to sync hasn't reached the server, so the
      // server's answer would be older than what the rep has actually done.
      const waiting = (await queue.list()).some((i) => (i.kind === 'checkIn' || i.kind === 'checkOut') && i.status === 'pending');
      if (waiting) {
        const snap = userId ? await loadAttendanceSnapshot(userId) : null;
        if (snap) applyState(snap);
        return;
      }
      const today = await attendanceApi.getAttendanceToday();
      applyState({
        checkedIn: today.checkedIn,
        checkedOutToday: !today.checkedIn && !!today.checkOutAt,
        checkInAt: today.checkInAt,
        status: today.status,
        locationVerified: today.checkInAt ? today.locationVerified : null,
      });
    } catch (err) {
      if (!isRetryable(err)) throw err;
      // No signal: carry on with the shift state we last saw today, if any.
      const snap = userId ? await loadAttendanceSnapshot(userId) : null;
      if (snap) applyState(snap);
    } finally {
      setIsLoading(false);
    }
  }, [applyState, userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // After a sync pass the server has the real record (time-based status, geofence result — or a refusal).
  useEffect(() => syncedEvents.subscribe(() => refresh().catch(() => {})), [refresh]);

  const checkIn = useCallback(
    async (assignmentId: string) => {
      const position = await getCheckInCoords({
        requestPermission: Location.requestForegroundPermissionsAsync,
        getCurrentPosition: () => Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      });
      const capturedAt = new Date().toISOString();

      if (isOnline || !canQueue) {
        try {
          const record = await attendanceApi.checkIn({
            assignmentId,
            latitude: position.latitude,
            longitude: position.longitude,
            timestamp: capturedAt,
          });
          applyState({
            checkedIn: true,
            checkedOutToday: false,
            checkInAt: record.checkInAt,
            status: record.status,
            locationVerified: record.checkInLocationVerified,
          });
          return;
        } catch (err) {
          if (!isRetryable(err)) throw err;
          if (!canQueue) throw offlineUnavailableError('check in');
        }
      }

      await queue.enqueue('checkIn', 'today', {
        assignmentId,
        latitude: position.latitude,
        longitude: position.longitude,
        capturedAt,
      });
      applyState({ checkedIn: true, checkedOutToday: false, checkInAt: capturedAt, status, locationVerified: null });
      await refreshCounts();
      showToast('Checked in on this phone — will sync automatically');
      syncNow();
    },
    [applyState, canQueue, isOnline, refreshCounts, showToast, status, syncNow]
  );

  const checkOut = useCallback(
    async (assignmentId?: string) => {
      // Best-effort GPS fix — a denied permission or a stalled/failed fix must
      // not block check-out (#50); the backend accepts check-out without coords.
      const coords = await getCheckoutCoords({
        requestPermission: Location.requestForegroundPermissionsAsync,
        getCurrentPosition: () => Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      });
      const capturedAt = new Date().toISOString();
      const body = {
        ...(assignmentId ? { assignmentId } : {}),
        ...(coords ? { latitude: coords.latitude, longitude: coords.longitude } : {}),
        timestamp: capturedAt,
        salesSummaryConfirmed: true as const,
      };
      const closed: ShiftState = { checkedIn: false, checkedOutToday: true, checkInAt: null, status, locationVerified: null };

      if (isOnline || !canQueue) {
        try {
          // Whatever is still on its way (e.g. the daily confirmation) must reach the server before the shift closes.
          await syncNow();
          await attendanceApi.checkOut(body);
          applyState(closed);
          return;
        } catch (err) {
          if (!isRetryable(err)) throw err;
          if (!canQueue) throw offlineUnavailableError('check out');
        }
      }

      await queue.enqueue('checkOut', 'today', { ...body, capturedAt });
      applyState(closed);
      await refreshCounts();
      showToast('Checked out on this phone — will sync automatically');
      syncNow();
    },
    [applyState, canQueue, isOnline, refreshCounts, showToast, status, syncNow]
  );

  return (
    <AttendanceContext.Provider
      value={{ checkedIn, checkedOutToday, checkInAt, status, locationVerified, isLoading, refresh, checkIn, checkOut }}
    >
      {children}
    </AttendanceContext.Provider>
  );
}

export function useAttendance(): AttendanceContextValue {
  const ctx = useContext(AttendanceContext);
  if (!ctx) throw new Error('useAttendance must be used within an AttendanceProvider');
  return ctx;
}
