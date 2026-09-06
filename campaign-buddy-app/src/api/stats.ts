// Spec §6.1-6.2 — Daily Stats
import { apiClient } from './client';
import type { DailyStats } from './types';

export async function getTodayStats(): Promise<DailyStats> {
  const { data } = await apiClient.get<{ data: DailyStats }>('/stats/today');
  return data.data;
}

/**
 * Send only the fields the rep actually changed with the +/- steppers, as
 * the FINAL absolute value (not a delta) — e.g. if footFall went from 12 to
 * 13 via one tap of "+", send `{ footFall: 13 }`, not `{ footFall: 1 }`.
 */
export interface StatsUpdateRequest {
  footFall?: number;
  approached?: number;
  converted?: number;
}

export async function updateTodayStats(payload: StatsUpdateRequest): Promise<DailyStats> {
  const { data } = await apiClient.patch<{ data: DailyStats }>('/stats/today', payload);
  return data.data;
}
