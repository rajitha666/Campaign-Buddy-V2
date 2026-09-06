// Spec §8 — Performance
import { apiClient } from './client';
import type { PerformanceSummary } from './types';

export async function getCampaignPerformance(
  campaignId: string,
  outletId: string
): Promise<PerformanceSummary> {
  const { data } = await apiClient.get<{ data: PerformanceSummary }>(
    `/campaigns/${campaignId}/performance`,
    { params: { outletId } }
  );
  return data.data;
}
