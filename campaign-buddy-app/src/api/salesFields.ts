// Spec §6.9 — custom sales fields (issue #13)
import { apiClient } from './client';
import type { CustomSalesField } from './types';

export interface SalesFieldSets {
  day: CustomSalesField[];
  product: CustomSalesField[];
}

export async function getSalesFields(): Promise<SalesFieldSets> {
  const { data } = await apiClient.get<{ data: SalesFieldSets }>('/sales-fields');
  return data.data;
}
