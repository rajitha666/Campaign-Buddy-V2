/**
 * Single source of truth for "am I currently checked in". This is
 * deliberately its own context (not folded into AuthContext) because
 * useLocationTracking.ts watches `checkedIn` to start/stop GPS pings —
 * see spec §5: pings run ONLY between check-in and check-out.
 *
 * Screens should read `checkedIn` / `checkInAt` from here rather than
 * re-fetching /attendance/today themselves, so the whole app agrees on
 * state the instant check-in or check-out happens.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as Location from 'expo-location';
import * as attendanceApi from '@/api/attendance';
import type { AttendanceStatus } from '@/api/types';
import { getCheckoutCoords } from '@/lib/checkoutLocation';
import { getCheckInCoords } from '@/lib/checkInLocation';

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
  /** Requests location permission + a fresh fix, then calls POST /attendance/check-in. */
  checkIn: (assignmentId: string) => Promise<void>;
  /**
   * `salesSummaryConfirmed` must be true — the checkout confirmation sheet
   * only calls this after the rep has actually confirmed (directly, or via
   * the sales-summary detour). See CheckoutConfirmSheet.tsx.
   * `assignmentId` targets one of a supervisor's several route outlets;
   * promoters omit it.
   */
  checkOut: (assignmentId?: string) => Promise<void>;
}

const AttendanceContext = createContext<AttendanceContextValue | undefined>(undefined);

export function AttendanceProvider({ children }: { children: React.ReactNode }) {
  const [checkedIn, setCheckedIn] = useState(false);
  const [checkedOutToday, setCheckedOutToday] = useState(false);
  const [checkInAt, setCheckInAt] = useState<string | null>(null);
  const [status, setStatus] = useState<AttendanceStatus | null>(null);
  const [locationVerified, setLocationVerified] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const today = await attendanceApi.getAttendanceToday();
      setCheckedIn(today.checkedIn);
      setCheckedOutToday(!today.checkedIn && !!today.checkOutAt);
      setCheckInAt(today.checkInAt);
      setStatus(today.status);
      setLocationVerified(today.checkInAt ? today.locationVerified : null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const checkIn = useCallback(async (assignmentId: string) => {
    const position = await getCheckInCoords({
      requestPermission: Location.requestForegroundPermissionsAsync,
      getCurrentPosition: () => Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
    });
    const record = await attendanceApi.checkIn({
      assignmentId,
      latitude: position.latitude,
      longitude: position.longitude,
      timestamp: new Date().toISOString(),
    });
    setCheckedIn(true);
    setCheckedOutToday(false);
    setCheckInAt(record.checkInAt);
    setStatus(record.status);
    setLocationVerified(record.checkInLocationVerified);
  }, []);

  const checkOut = useCallback(async (assignmentId?: string) => {
    // Best-effort GPS fix — a denied permission or a stalled/failed fix must
    // not block check-out (#50); the backend accepts check-out without coords.
    const coords = await getCheckoutCoords({
      requestPermission: Location.requestForegroundPermissionsAsync,
      getCurrentPosition: () => Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
    });
    await attendanceApi.checkOut({
      ...(assignmentId ? { assignmentId } : {}),
      ...(coords ? { latitude: coords.latitude, longitude: coords.longitude } : {}),
      timestamp: new Date().toISOString(),
      salesSummaryConfirmed: true,
    });
    setCheckedIn(false);
    setCheckedOutToday(true);
    setCheckInAt(null);
    setLocationVerified(null);
  }, []);

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
