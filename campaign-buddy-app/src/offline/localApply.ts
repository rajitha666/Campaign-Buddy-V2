/**
 * Offline reads + optimistic local edits.
 *
 * cachedFetch wraps a GET: live result is cached; on a network failure the last
 * cached copy is served so screens still open mid-shift with no signal. When a
 * write is queued, the patch* helpers overlay it onto those cached copies so
 * the rep sees their own numbers straight away (server-computed totals such as
 * totalSales only refresh after sync).
 */
import type {
  CampaignProductListItem,
  CustomFieldWrite,
  DailyStats,
  SalesSummary,
  StockUpdateRequest,
} from '@/api/types';
import type { SalesFieldSets } from '@/api/salesFields';
import type { StatsUpdateRequest } from '@/api/stats';
import { defaultCacheStore, readCache, writeCache, type CacheStore } from './cache';
import { pickBase } from './conflict';
import { isRetryable } from './networkError';
import { syncClock } from './syncClock';
import type { QueueKind } from './types';

// How long a screen waits on the network before showing the cached copy instead.
const STALE_AFTER_MS = 4_000;

/**
 * Live data when the network answers quickly; otherwise the last cached copy
 * (no signal, a struggling server, or a link too slow to wait for). If the live
 * reply lands after we've moved on it still refreshes the cache for next time.
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  store: CacheStore = defaultCacheStore,
  opts: { staleAfterMs?: number } = {}
): Promise<T> {
  const staleAfterMs = opts.staleAfterMs ?? STALE_AFTER_MS;
  const hit = await readCache<T>(key, store).catch(() => null);
  const live = fetcher().then(async (value) => {
    syncClock.note();
    await writeCache(key, value, store).catch(() => {});
    return value;
  });
  live.catch(() => {}); // a late failure after we returned the cached copy is not an error

  try {
    if (!hit) return await live;
    let timer: ReturnType<typeof setTimeout>;
    const stale = new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(hit.payload), staleAfterMs);
    });
    return await Promise.race([live, stale]).finally(() => clearTimeout(timer));
  } catch (err) {
    if (!isRetryable(err)) throw err;
    if (hit) return hit.payload;
    throw err;
  }
}

/** What the fields an edit is about to overwrite currently hold — the "base" for conflict detection. */
export async function readBase(
  kind: QueueKind,
  key: string,
  payload: unknown,
  day: string,
  store: CacheStore = defaultCacheStore
): Promise<Record<string, unknown> | undefined> {
  if (kind === 'stats') {
    const hit = await readCache<DailyStats>(cacheKeys.stats(day), store);
    return hit ? pickBase(kind, payload, hit.payload) : undefined;
  }
  if (kind === 'productStock') {
    const assignment = await readCache<{ campaign: { id: string }; outlet: { id: string } }>(cacheKeys.assignment(day), store);
    if (!assignment) return undefined;
    const { campaign, outlet } = assignment.payload;
    const list = await readCache<CampaignProductListItem[]>(cacheKeys.products(day, campaign.id, outlet.id), store);
    const item = list?.payload.find((p) => p.campaignProductAssignmentId === key);
    return item ? pickBase(kind, payload, item) : undefined;
  }
  return undefined;
}

// Two queued writes can patch the same cached entry at once (stats + tester both
// touch the sales summary); serialise the read-modify-write so neither is lost.
let patchLock: Promise<unknown> = Promise.resolve();

export function patchCache<T>(key: string, patch: (old: T) => T, store: CacheStore = defaultCacheStore): Promise<void> {
  const run = patchLock.then(async () => {
    const hit = await readCache<T>(key, store);
    if (hit) await writeCache(key, patch(hit.payload), store);
  });
  patchLock = run.catch(() => {});
  return run;
}

const defined = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

export const patchStats = (old: DailyStats, sent: StatsUpdateRequest): DailyStats => ({ ...old, ...defined(sent) });

const withFieldValues = <F extends { key: string; value: unknown }>(fields: F[], writes?: CustomFieldWrite): F[] =>
  writes ? fields.map((f) => (f.key in writes ? { ...f, value: writes[f.key] } : f)) : fields;

export const patchSalesFields = (old: SalesFieldSets, writes: CustomFieldWrite): SalesFieldSets => ({
  ...old,
  day: withFieldValues(old.day, writes),
});

export function patchSalesSummary(old: SalesSummary, kind: QueueKind, sent: unknown): SalesSummary {
  if (kind === 'stats') return { ...old, ...defined(sent as StatsUpdateRequest) };
  if (kind === 'salesConfirm' || kind === 'salesSummary') {
    const body = sent as { remarks?: string; customFields?: CustomFieldWrite };
    return {
      ...old,
      ...(body.remarks !== undefined ? { remarks: body.remarks } : {}),
      customFields: withFieldValues(old.customFields ?? [], body.customFields),
      ...(kind === 'salesConfirm' ? { confirmed: true } : {}),
    };
  }
  return old;
}

export function patchProducts(list: CampaignProductListItem[], cpaId: string, sent: StockUpdateRequest): CampaignProductListItem[] {
  return list.map((item) => {
    if (item.campaignProductAssignmentId !== cpaId) return item;
    const { customFields, ...scalars } = sent;
    const next = { ...item, ...defined(scalars), customFields: withFieldValues(item.customFields ?? [], customFields) };
    return { ...next, remainingStock: Math.max(next.openingStock - next.soldToday, 0) };
  });
}

export const filterReorder = (list: CampaignProductListItem[]) => list.filter((p) => p.reorderFlag);

// Today-scoped cache keys carry the local day so yesterday's numbers are never served as today's.
export const cacheKeys = {
  assignment: (day: string) => `assignment:${day}`,
  stats: (day: string) => `stats:${day}`,
  salesSummary: (day: string) => `sales-summary:${day}`,
  salesFields: (day: string) => `sales-fields:${day}`,
  products: (day: string, campaignId: string, outletId: string) => `products:${day}:${campaignId}:${outletId}`,
};

/** Overlay a just-queued write onto every cached read it affects. */
export async function applyQueuedWrite(kind: QueueKind, key: string, payload: unknown, day: string): Promise<void> {
  if (kind === 'stats') {
    await patchCache<DailyStats>(cacheKeys.stats(day), (o) => patchStats(o, payload as StatsUpdateRequest));
  }
  if (kind === 'stats' || kind === 'salesSummary' || kind === 'salesConfirm') {
    await patchCache<SalesSummary>(cacheKeys.salesSummary(day), (o) => patchSalesSummary(o, kind, payload));
  }
  if (kind === 'salesSummary' || kind === 'salesConfirm') {
    const writes = (payload as { customFields?: CustomFieldWrite }).customFields;
    if (writes) await patchCache<SalesFieldSets>(cacheKeys.salesFields(day), (o) => patchSalesFields(o, writes));
  }
  if (kind === 'productStock') {
    // The product list is cached per campaign+outlet; the assignment cache says which one is live.
    const assignment = await readCache<{ campaign: { id: string }; outlet: { id: string } }>(cacheKeys.assignment(day));
    if (assignment) {
      const { campaign, outlet } = assignment.payload;
      await patchCache<CampaignProductListItem[]>(cacheKeys.products(day, campaign.id, outlet.id), (o) =>
        patchProducts(o, key, payload as StockUpdateRequest)
      );
    }
  }
}
