import { describe, it, expect } from 'vitest';
import {
  enqueue,
  list,
  remove,
  clear,
  drain,
  retry,
  discard,
  keepMine,
  pendingOnly,
  failedOnly,
  conflictOnly,
  type QueueStore,
  type SyncHandlers,
} from './queue';
import type { QueuedMutation } from './types';

function makeStore(): QueueStore {
  let items: QueuedMutation[] = [];
  return {
    load: async () => items,
    save: async (next) => {
      items = next;
    },
  };
}

const ok = async () => {};
function handlersThat(overrides: Partial<SyncHandlers> = {}): SyncHandlers {
  return { checkIn: ok, stats: ok, salesSummary: ok, salesConfirm: ok, productStock: ok, checkOut: ok, ...overrides };
}
const http = (status: number, message = `HTTP ${status}`) =>
  Object.assign(new Error(message), { response: { status, data: { error: { message } } } });
const offline = () => new Error('Network Error');

describe('enqueue', () => {
  it('stores a pending entry', async () => {
    const store = makeStore();
    await enqueue('stats', 'today', { footFall: 5 }, store);
    const items = await list(store);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'stats', key: 'today', payload: { footFall: 5 }, status: 'pending', attempts: 0 });
  });

  it('a repeat edit replaces the earlier entry IN PLACE (latest absolute value wins, position kept)', async () => {
    const store = makeStore();
    await enqueue('stats', 'today', { footFall: 5 }, store);
    await enqueue('productStock', 'cpa1', { soldToday: 1 }, store);
    await enqueue('stats', 'today', { footFall: 9 }, store);
    const items = await list(store);
    expect(items.map((i) => i.kind)).toEqual(['stats', 'productStock']);
    expect(items[0].payload).toEqual({ footFall: 9 });
  });

  it('records when the LATEST edit was made (updatedAt) while keeping the first edit time (createdAt)', async () => {
    const store = makeStore();
    const first = await enqueue('stats', 'today', { footFall: 1 }, store);
    await new Promise((r) => setTimeout(r, 15));
    const second = await enqueue('stats', 'today', { footFall: 2 }, store);
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.updatedAt > first.updatedAt).toBe(true);
    expect((await list(store))[0].updatedAt).toBe(second.updatedAt);
  });

  it('hands the queue entry to the sender, so it can say when the edit was really made', async () => {
    const store = makeStore();
    const e = await enqueue('stats', 'today', { footFall: 1 }, store);
    let seen: unknown;
    await drain(handlersThat({ stats: async (_k, _p, item) => { seen = item.updatedAt; } }), { store });
    expect(seen).toBe(e.updatedAt);
  });

  it('keeps the ORIGINAL base across repeat edits — it is what the server held before we started', async () => {
    const store = makeStore();
    await enqueue('stats', 'today', { footFall: 44 }, store, { base: { footFall: 43 } });
    await enqueue('stats', 'today', { footFall: 46 }, store, { base: { footFall: 44 } });
    expect((await list(store))[0].base).toEqual({ footFall: 43 });
  });

  it('different keys or kinds do not collide', async () => {
    const store = makeStore();
    await enqueue('productStock', 'cpa1', {}, store);
    await enqueue('productStock', 'cpa2', {}, store);
    await enqueue('stats', 'cpa1', {}, store);
    expect(await list(store)).toHaveLength(3);
  });

  it('concurrent enqueues (e.g. stats + tester saved together) do not lose each other', async () => {
    let items: QueuedMutation[] = [];
    const slow: QueueStore = {
      load: async () => {
        await new Promise((r) => setTimeout(r, 5));
        return items;
      },
      save: async (next) => {
        await new Promise((r) => setTimeout(r, 5));
        items = next;
      },
    };
    await Promise.all([enqueue('stats', 'today', {}, slow), enqueue('salesSummary', 'today', {}, slow)]);
    expect(items.map((i) => i.kind).sort()).toEqual(['salesSummary', 'stats']);
  });

  it('remove and clear delete entries', async () => {
    const store = makeStore();
    const a = await enqueue('stats', 'today', {}, store);
    await enqueue('salesSummary', 'today', {}, store);
    await remove(a.id, store);
    expect(await list(store)).toHaveLength(1);
    await clear(store);
    expect(await list(store)).toHaveLength(0);
  });
});

describe('drain ordering', () => {
  it('sends check-in first, data next, confirm after data, check-out last — whatever the queue order', async () => {
    const store = makeStore();
    await enqueue('checkOut', 'today', {}, store);
    await enqueue('salesConfirm', 'today', {}, store);
    await enqueue('stats', 'today', {}, store);
    await enqueue('checkIn', 'today', {}, store);
    await enqueue('productStock', 'cpa1', {}, store);
    const sent: string[] = [];
    const record = (k: string) => async () => {
      sent.push(k);
    };
    await drain(
      handlersThat({
        checkIn: record('checkIn'),
        stats: record('stats'),
        productStock: record('productStock'),
        salesConfirm: record('salesConfirm'),
        checkOut: record('checkOut'),
      }),
      { store }
    );
    expect(sent).toEqual(['checkIn', 'stats', 'productStock', 'salesConfirm', 'checkOut']);
  });

  it('re-editing stats AFTER queuing the confirm still sends stats before the confirm', async () => {
    const store = makeStore();
    await enqueue('stats', 'today', { footFall: 5 }, store);
    await enqueue('salesConfirm', 'today', {}, store);
    await enqueue('stats', 'today', { footFall: 7 }, store);
    const sent: unknown[] = [];
    await drain(
      handlersThat({
        stats: async (_k, p) => {
          sent.push(p);
        },
        salesConfirm: async () => {
          sent.push('confirm');
        },
      }),
      { store }
    );
    expect(sent).toEqual([{ footFall: 7 }, 'confirm']);
  });
});

describe('drain outcomes', () => {
  it('removes each entry as it succeeds', async () => {
    const store = makeStore();
    await enqueue('stats', 'today', {}, store);
    await enqueue('productStock', 'cpa1', {}, store);
    const result = await drain(handlersThat(), { store });
    expect(result.syncedIds).toHaveLength(2);
    expect(result.stopped).toBeNull();
    expect(await list(store)).toHaveLength(0);
  });

  it('a network failure stops the drain and leaves that entry and the rest pending, attempts untouched', async () => {
    const store = makeStore();
    await enqueue('stats', 'today', {}, store);
    await enqueue('salesSummary', 'today', {}, store);
    await enqueue('productStock', 'cpa1', {}, store);
    const result = await drain(
      handlersThat({
        salesSummary: async () => {
          throw offline();
        },
      }),
      { store }
    );
    expect(result).toMatchObject({ stopped: 'network' });
    expect(result.syncedIds).toHaveLength(1);
    const remaining = await list(store);
    expect(remaining.map((i) => i.kind).sort()).toEqual(['productStock', 'salesSummary']);
    expect(remaining.every((i) => i.status === 'pending' && i.attempts === 0)).toBe(true);
  });

  it('a 503 is transient: stays pending (attempt counted), drain stops', async () => {
    const store = makeStore();
    await enqueue('stats', 'today', {}, store);
    const result = await drain(handlersThat({ stats: async () => { throw http(503); } }), { store });
    expect(result.stopped).toBe('retryable');
    expect((await list(store))[0]).toMatchObject({ status: 'pending', attempts: 1, lastError: 'HTTP 503' });
  });

  it('gives up on an entry that keeps failing transiently, so it cannot block the queue forever', async () => {
    const store = makeStore();
    await enqueue('stats', 'today', {}, store);
    const h = handlersThat({ stats: async () => { throw http(500); } });
    for (let i = 0; i < 8; i += 1) await drain(h, { store });
    expect((await list(store))[0].status).toBe('failed');
  });

  it('a 401 is an auth problem: stays pending, no attempt counted, drain stops', async () => {
    const store = makeStore();
    await enqueue('stats', 'today', {}, store);
    const result = await drain(handlersThat({ stats: async () => { throw http(401); } }), { store });
    expect(result.stopped).toBe('auth');
    expect((await list(store))[0]).toMatchObject({ status: 'pending', attempts: 0 });
  });

  it("a 4xx rejection marks that entry failed with the server's message and carries on", async () => {
    const store = makeStore();
    await enqueue('stats', 'today', {}, store);
    await enqueue('productStock', 'cpa1', {}, store);
    const result = await drain(handlersThat({ stats: async () => { throw http(409, 'Check in first'); } }), { store });
    expect(result.failedIds).toHaveLength(1);
    expect(result.syncedIds).toHaveLength(1);
    const items = await list(store);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'stats', status: 'failed', attempts: 1, lastError: 'Check in first' });
  });

  it('does not retry failed entries on the next drain', async () => {
    const store = makeStore();
    await enqueue('stats', 'today', {}, store);
    await drain(handlersThat({ stats: async () => { throw http(409); } }), { store });
    let calls = 0;
    await drain(handlersThat({ stats: async () => { calls += 1; } }), { store });
    expect(calls).toBe(0);
  });

  it('a request that hangs is abandoned after the timeout and treated as a network failure', async () => {
    const store = makeStore();
    await enqueue('stats', 'today', {}, store);
    const result = await drain(handlersThat({ stats: () => new Promise<void>(() => {}) }), { store, timeoutMs: 20 });
    expect(result.stopped).toBe('network');
    expect((await list(store))[0].status).toBe('pending');
  });

  it('an edit made while the drain is running is picked up in the same drain', async () => {
    const store = makeStore();
    await enqueue('stats', 'today', { footFall: 1 }, store);
    const sent: unknown[] = [];
    await drain(
      handlersThat({
        stats: async (_k, p) => {
          sent.push(p);
          if (sent.length === 1) await enqueue('stats', 'today', { footFall: 2 }, store);
        },
      }),
      { store }
    );
    expect(sent).toEqual([{ footFall: 1 }, { footFall: 2 }]);
    expect(await list(store)).toHaveLength(0);
  });
});

describe('conflicts', () => {
  const conflicting = [{ field: 'footFall', base: 43, server: 50, mine: 45 }];

  it('an entry whose fields changed on the server is parked as a conflict, not sent', async () => {
    const store = makeStore();
    await enqueue('stats', 'today', { footFall: 45 }, store, { base: { footFall: 43 } });
    let sent = 0;
    const result = await drain(handlersThat({ stats: async () => { sent += 1; } }), {
      store,
      checkConflict: async () => conflicting,
    });
    expect(sent).toBe(0);
    expect(result.conflictIds).toHaveLength(1);
    const items = await list(store);
    expect(conflictOnly(items)).toHaveLength(1);
    expect(items[0].conflict).toEqual(conflicting);
  });

  it('entries with no base are never checked', async () => {
    const store = makeStore();
    await enqueue('salesConfirm', 'today', {}, store);
    let checked = 0;
    await drain(handlersThat(), { store, checkConflict: async () => { checked += 1; return conflicting; } });
    expect(checked).toBe(0);
  });

  it('a network failure while checking stops the drain (nothing is sent blind)', async () => {
    const store = makeStore();
    await enqueue('stats', 'today', { footFall: 45 }, store, { base: { footFall: 43 } });
    let sent = 0;
    const result = await drain(handlersThat({ stats: async () => { sent += 1; } }), {
      store,
      checkConflict: async () => { throw offline(); },
    });
    expect(result.stopped).toBe('network');
    expect(sent).toBe(0);
  });

  it('keepMine re-queues a conflicting entry to send as-is, skipping the check', async () => {
    const store = makeStore();
    const e = await enqueue('stats', 'today', { footFall: 45 }, store, { base: { footFall: 43 } });
    await drain(handlersThat(), { store, checkConflict: async () => conflicting });
    await keepMine(e.id, store);
    let sent = 0;
    await drain(handlersThat({ stats: async () => { sent += 1; } }), { store, checkConflict: async () => conflicting });
    expect(sent).toBe(1);
  });
});

describe('retry and discard', () => {
  it('retry puts a failed entry back to pending', async () => {
    const store = makeStore();
    const e = await enqueue('stats', 'today', {}, store);
    await drain(handlersThat({ stats: async () => { throw http(409); } }), { store });
    expect(failedOnly(await list(store))).toHaveLength(1);
    await retry(e.id, store);
    const items = await list(store);
    expect(pendingOnly(items)).toHaveLength(1);
    expect(items[0]).toMatchObject({ attempts: 0 });
  });

  it('discard drops an entry', async () => {
    const store = makeStore();
    const e = await enqueue('stats', 'today', {}, store);
    await discard(e.id, store);
    expect(await list(store)).toHaveLength(0);
  });

  it('re-editing a failed entry supersedes it with a fresh pending one', async () => {
    const store = makeStore();
    await enqueue('stats', 'today', { footFall: 5 }, store, { base: { footFall: 1 } });
    await drain(handlersThat({ stats: async () => { throw http(409); } }), { store });
    await enqueue('stats', 'today', { footFall: 6 }, store, { base: { footFall: 5 } });
    const items = await list(store);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ status: 'pending', base: { footFall: 5 } });
  });
});
