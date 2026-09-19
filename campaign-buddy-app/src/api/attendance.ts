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
  /**
   * Set ONLY for a check-in queued while offline and sent later: the moment the
   * rep really did it. The server then records/judges it at that time instead of
   * sync time (ordinary requests keep server time — a wrong phone clock can't skew attendance).
   */
  capturedAt?: string;
}

export async function checkIn(payload: CheckInRequest): Promise<AttendanceRecord> {
  const { data } = await apiClient.post<{ data: AttendanceRecord }>('/attendance/check-in', payload);
  return data.data;
}

export interface CheckOutRequest {
  /**
   * Which route outlet to check out of — a supervisor has several
   * activations today, so the server needs the id to close the right
   * open shift (otherwise the next check-in 409s on the one-open-shift
   * lock). Promoters omit it; the server falls back to today's single
   * assignment.
   */
  assignmentId?: string;
  // Best-effort — omitted when permission was denied or no GPS fix could be
  // obtained in time; the backend accepts check-out without coords (#50).
  latitude?: number;
  longitude?: number;
  timestamp: string;
  /** Same as CheckInRequest.capturedAt — only for a check-out queued while offline. */
  capturedAt?: string;
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
