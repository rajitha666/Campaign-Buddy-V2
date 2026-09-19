import { describe, it, expect } from 'vitest';
import { cachedFetch, patchCache, readBase } from './localApply';
import { patchStats, patchSalesFields, patchSalesSummary, patchProducts, filterReorder } from './localApply';
import type { CacheEntry, CacheStore } from './cache';

function makeStore(): CacheStore {
  const data = new Map<string, CacheEntry>();
  return {
    load: async (k) => data.get(k) ?? null,
    save: async (k, e) => {
      data.set(k, e);
    },
  };
}
const offline = Object.assign(new Error('Network Error'), {});
const rejected = Object.assign(new Error('nope'), { response: { status: 409 } });

describe('cachedFetch', () => {
  it('returns the live value and caches it', async () => {
    const store = makeStore();
    expect(await cachedFetch('k', async () => ({ a: 1 }), store)).toEqual({ a: 1 });
    expect((await store.load('k'))?.payload).toEqual({ a: 1 });
  });

  it('falls back to the cached value when the network is down', async () => {
    const store = makeStore();
    await cachedFetch('k', async () => ({ a: 1 }), store);
    expect(await cachedFetch('k', async () => { throw offline; }, store)).toEqual({ a: 1 });
  });

  it('rethrows when offline and nothing is cached yet', async () => {
    await expect(cachedFetch('k', async () => { throw offline; }, makeStore())).rejects.toBe(offline);
  });

  it('rethrows real server errors instead of masking them with stale data', async () => {
    const store = makeStore();
    await cachedFetch('k', async () => ({ a: 1 }), store);
    await expect(cachedFetch('k', async () => { throw rejected; }, store)).rejects.toBe(rejected);
  });

  it('a struggling server (503) is treated like no signal: serve the cached copy', async () => {
    const store = makeStore();
    await cachedFetch('k', async () => ({ a: 1 }), store);
    const unwell = Object.assign(new Error('x'), { response: { status: 503 } });
    expect(await cachedFetch('k', async () => { throw unwell; }, store)).toEqual({ a: 1 });
  });

  it('on a slow link, serves the cached copy after a short wait instead of hanging — and still refreshes the cache when the reply lands', async () => {
    const store = makeStore();
    await cachedFetch('k', async () => ({ a: 1 }), store);
    const slow = () => new Promise<{ a: number }>((resolve) => setTimeout(() => resolve({ a: 2 }), 60));
    expect(await cachedFetch('k', slow, store, { staleAfterMs: 10 })).toEqual({ a: 1 });
    await new Promise((r) => setTimeout(r, 120));
    expect((await store.load('k'))?.payload).toEqual({ a: 2 });
  });

  it('with nothing cached it waits for the live reply however long it takes', async () => {
    const slow = () => new Promise<{ a: number }>((resolve) => setTimeout(() => resolve({ a: 3 }), 40));
    expect(await cachedFetch('fresh', slow, makeStore(), { staleAfterMs: 5 })).toEqual({ a: 3 });
  });
});

describe('readBase', () => {
  it('captures what the edited stats fields held, from the cache', async () => {
    const store = makeStore();
    await cachedFetch('stats:2026-09-18', async () => ({ footFall: 43, approached: 24, converted: 9 }), store);
    expect(await readBase('stats', 'today', { footFall: 45 }, '2026-09-18', store)).toEqual({ footFall: 43 });
  });

  it('captures a stock item by its assignment id', async () => {
    const store = makeStore();
    await cachedFetch('assignment:2026-09-18', async () => ({ campaign: { id: 'c' }, outlet: { id: 'o' } }), store);
    await cachedFetch('products:2026-09-18:c:o', async () => [{ campaignProductAssignmentId: 'a', soldToday: 4 }], store);
    expect(await readBase('productStock', 'a', { soldToday: 5 }, '2026-09-18', store)).toEqual({ soldToday: 4 });
  });

  it('is undefined when nothing is cached or the kind is not tracked', async () => {
    expect(await readBase('stats', 'today', { footFall: 1 }, '2026-09-18', makeStore())).toBeUndefined();
    expect(await readBase('salesConfirm', 'today', {}, '2026-09-18', makeStore())).toBeUndefined();
  });
});

describe('patchCache', () => {
  it('patches an existing entry and ignores a missing one', async () => {
    const store = makeStore();
    await patchCache<{ n: number }>('k', (o) => ({ n: o.n + 1 }), store);
    expect(await store.load('k')).toBeNull();
    await cachedFetch('k', async () => ({ n: 1 }), store);
    await patchCache<{ n: number }>('k', (o) => ({ n: o.n + 1 }), store);
    expect((await store.load('k'))?.payload).toEqual({ n: 2 });
  });
});

describe('local patches for queued writes', () => {
  it('patchStats overlays only the fields that were sent', () => {
    const old = { footFall: 1, approached: 2, converted: 1, conversionRate: 0.5, totalSales: 900 };
    expect(patchStats(old, { footFall: 9 })).toEqual({ ...old, footFall: 9 });
  });

  it('patchSalesFields updates day field values by key', () => {
    const old = { day: [{ key: 'tester', value: 1 }, { key: 'other', value: 'x' }], product: [] };
    const next = patchSalesFields(old as never, { tester: 4 });
    expect(next.day).toEqual([{ key: 'tester', value: 4 }, { key: 'other', value: 'x' }]);
  });

  it('patchSalesSummary applies stats, remarks, custom fields and confirmation', () => {
    const old = { footFall: 0, approached: 0, converted: 0, remarks: null, confirmed: false, customFields: [{ key: 'tester', value: 0 }] };
    expect(patchSalesSummary(old as never, 'stats', { footFall: 5, approached: 3 })).toMatchObject({ footFall: 5, approached: 3, converted: 0 });
    expect(patchSalesSummary(old as never, 'salesSummary', { remarks: 'busy', customFields: { tester: 2 } })).toMatchObject({
      remarks: 'busy',
      customFields: [{ key: 'tester', value: 2 }],
    });
    expect(patchSalesSummary(old as never, 'salesConfirm', {})).toMatchObject({ confirmed: true });
  });

  it('patchProducts updates the matching item and recomputes remaining stock', () => {
    const list = [
      { campaignProductAssignmentId: 'a', openingStock: 10, soldToday: 0, otherInterestedCustomers: 0, reorderFlag: false, remainingStock: 10, customFields: [] },
      { campaignProductAssignmentId: 'b', openingStock: 5, soldToday: 1, otherInterestedCustomers: 0, reorderFlag: false, remainingStock: 4, customFields: [] },
    ];
    const next = patchProducts(list as never, 'a', { soldToday: 3, reorderFlag: true });
    expect(next[0]).toMatchObject({ soldToday: 3, remainingStock: 7, reorderFlag: true });
    expect(next[1]).toEqual(list[1]);
  });

  it('filterReorder keeps only items flagged for reorder', () => {
    expect(filterReorder([{ reorderFlag: true }, { reorderFlag: false }] as never)).toEqual([{ reorderFlag: true }]);
  });
});
