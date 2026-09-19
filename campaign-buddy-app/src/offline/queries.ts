/**
 * Offline-tolerant versions of the reads the promoter screens depend on
 * (see localApply.ts). Drop-in `queryFn`s: same data online, last cached copy
 * from today when the network is down.
 */
import * as profileApi from '@/api/profile';
import * as statsApi from '@/api/stats';
import * as salesFieldsApi from '@/api/salesFields';
import * as salesSummaryApi from '@/api/salesSummary';
import * as productsApi from '@/api/products';
import * as performanceApi from '@/api/performance';
import * as supervisorRouteApi from '@/api/supervisorRoute';
import * as attendanceApi from '@/api/attendance';
import { Image } from 'react-native';
import { localDayKey } from '@/lib/date';
import { resolveFileUrl } from '@/lib/files';
import { readCache } from './cache';
import { cacheKeys, cachedFetch, filterReorder } from './localApply';
import { isNetworkError } from './networkError';
import type { CampaignProductListItem } from '@/api/types';

export const getTodayAssignment = () => cachedFetch(cacheKeys.assignment(localDayKey()), profileApi.getTodayAssignment);
/** Multi-outlet promoters: every assignment open today, chosen outlet included (backend /me/assignments). */
export const getMyAssignments = () => cachedFetch(cacheKeys.assignments(localDayKey()), supervisorRouteApi.getMyAssignments);
export const getTodayStats = (assignmentId?: string) =>
  cachedFetch(cacheKeys.stats(localDayKey(), assignmentId), () => statsApi.getTodayStats(assignmentId));
export const getSalesFields = () => cachedFetch(cacheKeys.salesFields(localDayKey()), salesFieldsApi.getSalesFields);
export const getAttendanceHistory = () =>
  cachedFetch(`attendance-history:${localDayKey()}`, () => attendanceApi.getAttendanceHistory('week'));
export const getCampaignPerformance = (campaignId: string, outletId: string) =>
  cachedFetch(`performance:${localDayKey()}:${campaignId}:${outletId}`, () =>
    performanceApi.getCampaignPerformance(campaignId, outletId)
  );

// Not day-scoped: a product's description doesn't change with the date.
export const getProductDetails = (productId: string) =>
  cachedFetch(`product:${productId}`, () => productsApi.getProductDetails(productId));
export const getLast7Days = () => cachedFetch(`stats-range-7d:${localDayKey()}`, () => statsApi.getLast7Days());
export const getTodaySalesSummary = (assignmentId?: string) =>
  cachedFetch(cacheKeys.salesSummary(localDayKey(), assignmentId), () => salesSummaryApi.getTodaySalesSummary(assignmentId));

export async function getCampaignProducts(
  campaignId: string,
  outletId: string,
  opts?: { reorderOnly?: boolean }
): Promise<CampaignProductListItem[]> {
  const day = localDayKey();
  if (!opts?.reorderOnly) {
    return cachedFetch(cacheKeys.products(day, campaignId, outletId), async () => {
      const products = await productsApi.getCampaignProducts(campaignId, outletId);
      // Warm the device's image cache while there's signal, so thumbnails still show later without it.
      for (const p of products) {
        const url = resolveFileUrl(p.product.imageUrl);
        if (url) Image.prefetch(url).catch(() => {});
      }
      return products;
    });
  }
  // Only the full list is cached; the reorder view is derived from it when offline.
  try {
    return await productsApi.getCampaignProducts(campaignId, outletId, opts);
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    const hit = await readCache<CampaignProductListItem[]>(cacheKeys.products(day, campaignId, outletId));
    if (hit) return filterReorder(hit.payload);
    throw err;
  }
}
