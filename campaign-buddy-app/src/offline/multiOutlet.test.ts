/**
 * Multi-outlet promoters pick an activation per outlet; any queued write
 * (offline stats / sales summary) carries the chosen assignmentId, the sync
 * handlers forward it as the ?assignmentId= query param (never in the body),
 * and the day-caches are keyed per assignment so outlet B's numbers can't be
 * served (or patched) as outlet A's.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls: Array<{ method: string; path: string; body?: unknown; params?: unknown }> = [];
vi.mock('@/api/client', () => {
  const rec =
    (method: string) =>
    (path: string, a?: unknown, b?: unknown) => {
      const isWrite = method === 'post' || method === 'patch';
      calls.push({
        method,
        path,
        body: isWrite ? a : undefined,
        params: (isWrite ? (b as any) : (a as any))?.params,
      });
      return Promise.resolve({ data: { data: { ok: true } } });
    };
  return { apiClient: { get: rec('get'), post: rec('post'), patch: rec('patch'), delete: rec('delete') } };
});

import { applyQueuedWrite, cacheKeys, patchCache, patchStats } from './localApply';
import { readCache, writeCache, type CacheEntry, type CacheStore } from './cache';
import type { QueuedMutation } from './types';
import { syncHandlers } from './runSync';
import type { StatsUpdateRequest } from '@/api/stats';
import type { DailyStats } from '@/api/types';

function makeStore(): CacheStore {
  const data = new Map<string, CacheEntry>();
  return {
    load: async (k) => data.get(k) ?? null,
    save: async (k, e) => {
      data.set(k, e);
    },
  };
}

beforeEach(() => {
  calls.length = 0;
});

describe('sync handlers — assignmentId routing', () => {
  it('stats handler strips assignmentId from the body and sends it as the query param', async () => {
    await syncHandlers.stats(
      'stats:a2',
      { footFall: 5, approached: 2, assignmentId: 'a2', capturedAt: 'x' } as unknown as StatsUpdateRequest,
      { updatedAt: '2026-09-19T10:00:00.000Z' } as QueuedMutation as any
    );
    expect(calls[0].path).toBe('/stats/today');
    expect(calls[0].params).toEqual({ assignmentId: 'a2' });
    expect(calls[0].body).toEqual({ footFall: 5, approached: 2, capturedAt: '2026-09-19T10:00:00.000Z' });
  });

  it('stats handler without an assignmentId stays param-less', async () => {
    await syncHandlers.stats('today', { footFall: 1, capturedAt: 'x' } as unknown as StatsUpdateRequest, {
      updatedAt: 'z',
    } as any);
    expect(calls[0].params).toBeUndefined();
    expect(calls[0].body).toEqual({ footFall: 1, capturedAt: 'z' });
  });

  it('sales summary + confirm handlers route the assignmentId the same way', async () => {
    await syncHandlers.salesSummary('salesSummary:a2', { remarks: 'r', assignmentId: 'a2' } as any, {
      updatedAt: 'z',
    } as any);
    await syncHandlers.salesConfirm('salesConfirm:a2', { remarks: 'r', assignmentId: 'a2' } as any, {
      updatedAt: 'z',
    } as any);
    expect(calls.map((c) => `${c.method} ${c.path} ${JSON.stringify(c.params) ?? ''}`)).toEqual([
      'patch /sales-summary/today {"assignmentId":"a2"}',
      'post /sales-summary/today/confirm {"assignmentId":"a2"}',
    ]);
  });
});

describe('per-assignment day caches', () => {
  it('cacheKeys separate outlets when an assignmentId is given', () => {
    expect(cacheKeys.stats('2026-09-19', 'a2')).toBe('stats:2026-09-19:a2');
    expect(cacheKeys.stats('2026-09-19')).toBe('stats:2026-09-19');
    expect(cacheKeys.salesSummary('2026-09-19', 'a2')).toBe('sales-summary:2026-09-19:a2');
    expect(cacheKeys.salesSummary('2026-09-19')).toBe('sales-summary:2026-09-19');
  });

  it('patchStats never leaks the assignmentId field into the cached DailyStats', () => {
    const next = patchStats(
      { footFall: 1, approached: 1, converted: 0, conversionRate: 0, totalSales: 0 } as DailyStats,
      { footFall: 3, assignmentId: 'a2' } as StatsUpdateRequest
    );
    expect(next).toEqual({ footFall: 3, approached: 1, converted: 0, conversionRate: 0, totalSales: 0 });
    expect((next as unknown as Record<string, unknown>).assignmentId).toBeUndefined();
  });

  it('applyQueuedWrite stats lands on the chosen assignment cache, not the first outlet', async () => {
    const store = makeStore();
    await writeCache(cacheKeys.stats('2026-09-19', 'a2'), { footFall: 0, approached: 0, converted: 0, conversionRate: 0, totalSales: 0 } as DailyStats, store);
    await writeCache(cacheKeys.stats('2026-09-19', 'a3'), { footFall: 9, approached: 9, converted: 9, conversionRate: 9, totalSales: 9 } as DailyStats, store);
    await applyQueuedWrite('stats', 'stats:a2', { footFall: 5, assignmentId: 'a2' }, '2026-09-19', store);
    expect(((await readCache(cacheKeys.stats('2026-09-19', 'a2'), store))?.payload as DailyStats).footFall).toBe(5);
    const untouched = await readCache(cacheKeys.stats('2026-09-19', 'a3'), store);
    expect((untouched?.payload as DailyStats).footFall).toBe(9);
  });

  it('applyQueuedWrite without an assignmentId patches the legacy key', async () => {
    const store = makeStore();
    await writeCache(cacheKeys.stats('2026-09-19'), { footFall: 0 } as DailyStats, store);
    await applyQueuedWrite('stats', 'today', { footFall: 5 }, '2026-09-19', store);
    expect(((await readCache(cacheKeys.stats('2026-09-19'), store))?.payload as DailyStats).footFall).toBe(5);
  });
});
