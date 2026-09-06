// Spec §6.6-6.8 — Sales Summary
import { apiClient } from './client';
import type { SalesSummary } from './types';

export async function getTodaySalesSummary(): Promise<SalesSummary> {
  const { data } = await apiClient.get<{ data: SalesSummary }>('/sales-summary/today');
  return data.data;
}

export async function updateSalesSummaryRemarks(remarks: string): Promise<SalesSummary> {
  const { data } = await apiClient.patch<{ data: SalesSummary }>('/sales-summary/today', { remarks });
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
export async function confirmSalesSummary(remarks?: string): Promise<SalesSummary> {
  const { data } = await apiClient.post<{ data: SalesSummary }>('/sales-summary/today/confirm', {
    remarks,
  });
  return data.data;
}
