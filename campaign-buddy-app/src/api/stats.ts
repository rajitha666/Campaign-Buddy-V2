// Spec §6.1-6.2 — Daily Stats
import { apiClient } from './client';
import type { DailyStats, StatsRangeResult } from './types';

export async function getTodayStats(): Promise<DailyStats> {
  const { data } = await apiClient.get<{ data: DailyStats }>('/stats/today');
  return data.data;
}

/**
 * Last 7 days (or any range) of the rep's own day-level rollups — backs the
 * Sales tab's "Last 7 days" section. Dates are "YYYY-MM-DD"; omit both to
 * let the server default to today-6 → today.
 */
export async function getStatsRange(dateFrom?: string, dateTo?: string): Promise<StatsRangeResult> {
  const { data } = await apiClient.get<{ data: StatsRangeResult }>('/stats/range', {
    params: { dateFrom, dateTo },
  });
  return data.data;
}

/** Convenience wrapper — the Sales tab only ever asks for the last 7 days. */
export function getLast7Days(): Promise<StatsRangeResult> {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const to = new Date();
  const from = new Date(to.getTime() - 6 * 86_400_000);
  return getStatsRange(fmt(from), fmt(to));
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
