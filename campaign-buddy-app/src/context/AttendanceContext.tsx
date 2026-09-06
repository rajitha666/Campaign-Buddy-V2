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

interface AttendanceContextValue {
  checkedIn: boolean;
  checkInAt: string | null;
  status: AttendanceStatus | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  /** Requests location permission + a fresh fix, then calls POST /attendance/check-in. */
  checkIn: (assignmentId: string) => Promise<void>;
  /**
   * `salesSummaryConfirmed` must be true — the checkout confirmation sheet
   * only calls this after the rep has actually confirmed (directly, or via
   * the sales-summary detour). See CheckoutConfirmSheet.tsx.
   */
  checkOut: () => Promise<void>;
}

const AttendanceContext = createContext<AttendanceContextValue | undefined>(undefined);

export function AttendanceProvider({ children }: { children: React.ReactNode }) {
  const [checkedIn, setCheckedIn] = useState(false);
  const [checkInAt, setCheckInAt] = useState<string | null>(null);
  const [status, setStatus] = useState<AttendanceStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const today = await attendanceApi.getAttendanceToday();
      setCheckedIn(today.checkedIn);
      setCheckInAt(today.checkInAt);
      setStatus(today.status);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const checkIn = useCallback(async (assignmentId: string) => {
    const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
    if (permStatus !== 'granted') {
      throw new Error('Location permission is required to check in.');
    }
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const record = await attendanceApi.checkIn({
      assignmentId,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      timestamp: new Date().toISOString(),
    });
    setCheckedIn(true);
    setCheckInAt(record.checkInAt);
    setStatus(record.status);
  }, []);

  const checkOut = useCallback(async () => {
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    await attendanceApi.checkOut({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      timestamp: new Date().toISOString(),
      salesSummaryConfirmed: true,
    });
    setCheckedIn(false);
    setCheckInAt(null);
  }, []);

  return (
    <AttendanceContext.Provider
      value={{ checkedIn, checkInAt, status, isLoading, refresh, checkIn, checkOut }}
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
