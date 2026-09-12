// Spec §5 — Attendance & Location
import { apiClient } from './client';
import type { AttendanceRecord, AttendanceToday, AttendanceHistoryEntry } from './types';

/**
 * `assignmentId` lets a supervisor ask about one specific outlet Activation
 * among several concurrent ones today — omit it (as the promoter flow does)
 * to get the server's single-activation default.
 */
export async function getAttendanceToday(assignmentId?: string): Promise<AttendanceToday> {
  const { data } = await apiClient.get<{ data: AttendanceToday }>('/attendance/today', {
    params: assignmentId ? { assignmentId } : undefined,
  });
  return data.data;
}

export interface CheckInRequest {
  assignmentId: string;
  latitude: number;
  longitude: number;
  timestamp: string; // ISODateTime
}

export async function checkIn(payload: CheckInRequest): Promise<AttendanceRecord> {
  const { data } = await apiClient.post<{ data: AttendanceRecord }>('/attendance/check-in', payload);
  return data.data;
}

export interface CheckOutRequest {
  latitude: number;
  longitude: number;
  timestamp: string;
  /**
   * True only when the rep tapped "Yes, check out" on the confirm popup.
   * If they tap "No, confirm sales summary" instead, DO NOT call this yet —
   * navigate to Sales Summary, call salesSummary.confirmToday(), then call
   * this endpoint. See CheckoutConfirmSheet.tsx for the exact flow.
   */
  salesSummaryConfirmed: true;
}

export async function checkOut(payload: CheckOutRequest): Promise<AttendanceRecord> {
  const { data } = await apiClient.post<{ data: AttendanceRecord }>('/attendance/check-out', payload);
  return data.data;
}

export async function getAttendanceHistory(
  range: 'week' | 'month' = 'week'
): Promise<AttendanceHistoryEntry[]> {
  const { data } = await apiClient.get<{ data: AttendanceHistoryEntry[] }>('/attendance/history', {
    params: { range },
  });
  return data.data;
}
