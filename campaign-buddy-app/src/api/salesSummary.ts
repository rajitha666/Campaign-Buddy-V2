// Spec §6.6-6.9 — Sales Summary
import { apiClient } from './client';
import type { SalesSummary, CustomFieldWrite } from './types';

// `assignmentId` targets one specific assignment when the rep is on more than
// one outlet today (multi-outlet promoters pick freely); omit it for the
// single-assignment flow — same param as /attendance/today.
const params = (assignmentId?: string) => (assignmentId ? { params: { assignmentId } } : undefined);

export async function getTodaySalesSummary(assignmentId?: string): Promise<SalesSummary> {
  const { data } = await apiClient.get<{ data: SalesSummary }>('/sales-summary/today', params(assignmentId));
  return data.data;
}

export async function updateSalesSummary(
  payload: {
    remarks?: string;
    customFields?: CustomFieldWrite;
    capturedAt?: string;
  },
  assignmentId?: string
): Promise<SalesSummary> {
  const { data } = await apiClient.patch<{ data: SalesSummary }>('/sales-summary/today', payload, params(assignmentId));
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
export async function confirmSalesSummary(
  payload: {
    remarks?: string;
    customFields?: CustomFieldWrite;
    capturedAt?: string;
  } = {},
  assignmentId?: string
): Promise<SalesSummary> {
  const { data } = await apiClient.post<{ data: SalesSummary }>('/sales-summary/today/confirm', payload, params(assignmentId));
  return data.data;
}
