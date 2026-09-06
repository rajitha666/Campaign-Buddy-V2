// Spec §6.3-6.5 — Products & Stock
import { apiClient } from './client';
import type { CampaignProductListItem, ProductDetails, StockEntry, StockUpdateRequest } from './types';

export async function getCampaignProducts(
  campaignId: string,
  outletId: string,
  opts?: { reorderOnly?: boolean }
): Promise<CampaignProductListItem[]> {
  const { data } = await apiClient.get<{ data: CampaignProductListItem[] }>(
    `/campaigns/${campaignId}/outlets/${outletId}/products`,
    { params: opts?.reorderOnly ? { reorderOnly: true } : undefined }
  );
  return data.data;
}

export async function getProductDetails(productId: string): Promise<ProductDetails> {
  const { data } = await apiClient.get<{ data: ProductDetails }>(`/products/${productId}`);
  return data.data;
}

/**
 * `campaignProductAssignmentId` — NOT the raw product id. This is the join
 * row returned as `campaignProductAssignmentId` from getCampaignProducts().
 * Sending only changed fields matches the steppers/toggle UI: each control
 * fires its own small PATCH rather than one big save.
 */
export async function updateStock(
  campaignProductAssignmentId: string,
  payload: StockUpdateRequest
): Promise<StockEntry> {
  const { data } = await apiClient.patch<{ data: StockEntry }>(
    `/products/${campaignProductAssignmentId}/stock`,
    payload
  );
  return data.data;
}
