// Spec §6.6-6.9 — Sales Summary
import { apiClient } from './client';
import type { SalesSummary, CustomFieldWrite } from './types';

export async function getTodaySalesSummary(): Promise<SalesSummary> {
  const { data } = await apiClient.get<{ data: SalesSummary }>('/sales-summary/today');
  return data.data;
}

export async function updateSalesSummary(payload: {
  remarks?: string;
  customFields?: CustomFieldWrite;
}): Promise<SalesSummary> {
  const { data } = await apiClient.patch<{ data: SalesSummary }>('/sales-summary/today', payload);
  return data.data;
}

/**
 * Called from two places:
 *  1. The Sales screen's "Confirm & submit" button, directly.
 *  2. The checkout confirmation popup's "No, confirm sales summary" path —
 *     confirm here FIRST, then call attendance.checkOut() with
 *     `salesSummaryConfirmed: true`.
 * Idempotent: calling it twice is safe (spec §6.8 — 409 treated as success).
 */
export async function confirmSalesSummary(payload: {
  remarks?: string;
  customFields?: CustomFieldWrite;
} = {}): Promise<SalesSummary> {
  const { data } = await apiClient.post<{ data: SalesSummary }>(
    '/sales-summary/today/confirm',
    payload
  );
  return data.data;
}
