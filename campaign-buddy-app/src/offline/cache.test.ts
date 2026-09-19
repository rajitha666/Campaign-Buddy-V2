import { describe, it, expect } from 'vitest';
import { readCache, writeCache, type CacheStore, type CacheEntry } from './cache';

function makeStore(): CacheStore {
  const data = new Map<string, CacheEntry>();
  return {
    load: async (key) => data.get(key) ?? null,
    save: async (key, entry) => {
      data.set(key, entry);
    },
  };
}

describe('offline cache', () => {
  it('returns null for a key that was never written', async () => {
    expect(await readCache('stats:today', makeStore())).toBeNull();
  });

  it('round-trips the payload with the sync timestamp', async () => {
    const store = makeStore();
    const written = await writeCache('stats:today', { footFall: 7 }, store, () => '2026-09-18T10:00:00.000Z');
    expect(written).toEqual({ payload: { footFall: 7 }, lastSyncedAt: '2026-09-18T10:00:00.000Z' });
    expect(await readCache('stats:today', store)).toEqual(written);
  });

  it('keeps keys independent and overwrites on rewrite', async () => {
    const store = makeStore();
    await writeCache('stats:today', { footFall: 1 }, store);
    await writeCache('sales-summary:today', { remarks: 'x' }, store);
    await writeCache('stats:today', { footFall: 2 }, store);
    expect((await readCache<{ footFall: number }>('stats:today', store))?.payload.footFall).toBe(2);
    expect((await readCache<{ remarks: string }>('sales-summary:today', store))?.payload.remarks).toBe('x');
  });
});
