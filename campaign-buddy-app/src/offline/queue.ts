import { getJSON, setJSON } from './storage';
import { classifyError, errorMessage, type ErrorKind } from './networkError';
import type { ConflictField } from './conflict';
import type { QueuedMutation, QueueKind } from './types';

export interface QueueStore {
  load: () => Promise<QueuedMutation[]>;
  save: (items: QueuedMutation[]) => Promise<void>;
}

const QUEUE_STORAGE_KEY = 'cb_offline_queue';

export const defaultQueueStore: QueueStore = {
  load: async () => (await getJSON<QueuedMutation[]>(QUEUE_STORAGE_KEY)) ?? [],
  save: (items) => setJSON(QUEUE_STORAGE_KEY, items),
};

/** Send order. A shift's check-in must exist before anything is written to it; confirm needs the day's stats; check-out closes the shift. */
const RANK: Record<QueueKind, number> = { checkIn: 0, stats: 1, salesSummary: 1, productStock: 1, salesConfirm: 2, checkOut: 3 };

/** A server that keeps answering 5xx to the same edit must not block everything behind it forever. */
const MAX_TRANSIENT_ATTEMPTS = 8;
const DEFAULT_SEND_TIMEOUT_MS = 20_000;

let idCounter = 0;

// Every mutation is a load → modify → save on one persisted array; serialise them
// so concurrent saves (stats + tester on the same screen) can't overwrite each other.
let lock: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = lock.then(fn, fn);
  lock = run.catch(() => {});
  return run;
}

/**
 * Every write API takes the final absolute value, not a delta (see api/stats.ts),
 * so a repeat edit to the same kind+key replaces the earlier entry instead of
 * stacking — IN PLACE, so it keeps its original position and age. `base` (what the
 * server held before the edit) is kept from the first edit; a re-edit of a
 * failed/conflicting entry starts a fresh base.
 */
export function enqueue(
  kind: QueueKind,
  key: string,
  payload: unknown,
  store: QueueStore = defaultQueueStore,
  opts: { base?: Record<string, unknown> } = {}
): Promise<QueuedMutation> {
  return withLock(async () => {
    const items = await store.load();
    idCounter += 1;
    const idx = items.findIndex((i) => i.kind === kind && i.key === key);
    const prior = idx >= 0 ? items[idx] : undefined;
    const now = new Date().toISOString();
    const entry: QueuedMutation = {
      id: `${kind}:${key}:${Date.now()}:${idCounter}`,
      kind,
      key,
      payload,
      createdAt: prior?.createdAt ?? now,
      updatedAt: now,
      status: 'pending',
      attempts: 0,
      base: prior && prior.status === 'pending' && prior.base ? prior.base : opts.base,
    };
    await store.save(prior ? items.map((i, n) => (n === idx ? entry : i)) : [...items, entry]);
    return entry;
  });
}

export const list = (store: QueueStore = defaultQueueStore) => store.load();

function patchItem(id: string, patch: (i: QueuedMutation) => QueuedMutation, store: QueueStore): Promise<void> {
  return withLock(async () => {
    await store.save((await store.load()).map((i) => (i.id === id ? patch(i) : i)));
  });
}

export function remove(id: string, store: QueueStore = defaultQueueStore): Promise<void> {
  return withLock(async () => {
    await store.save((await store.load()).filter((i) => i.id !== id));
  });
}

export const discard = remove;
export const clear = (store: QueueStore = defaultQueueStore) => withLock(() => store.save([]));

/** Try a failed entry again. */
export const retry = (id: string, store: QueueStore = defaultQueueStore) =>
  patchItem(id, (i) => ({ ...i, status: 'pending', attempts: 0, lastError: undefined }), store);

/** The rep chose their own numbers over the server's: send as-is, without re-checking. */
export const keepMine = (id: string, store: QueueStore = defaultQueueStore) =>
  patchItem(id, (i) => ({ ...i, status: 'pending', conflict: undefined, base: undefined }), store);

export const pendingOnly = (items: QueuedMutation[]) => items.filter((i) => i.status === 'pending');
export const failedOnly = (items: QueuedMutation[]) => items.filter((i) => i.status === 'failed');
export const conflictOnly = (items: QueuedMutation[]) => items.filter((i) => i.status === 'conflict');

const sendOrder = (items: QueuedMutation[]) =>
  [...items].sort((a, b) => RANK[a.kind] - RANK[b.kind] || a.createdAt.localeCompare(b.createdAt));

export type SyncHandlers = Record<QueueKind, (key: string, payload: unknown, item: QueuedMutation) => Promise<void>>;

export interface DrainOptions {
  store?: QueueStore;
  /** Per-request cap, so one hung connection can't wedge the whole queue. */
  timeoutMs?: number;
  /** Return the fields that changed on the server since the edit began (empty/null = safe to send). */
  checkConflict?: (item: QueuedMutation) => Promise<ConflictField[] | null>;
}

export interface DrainResult {
  syncedIds: string[];
  failedIds: string[];
  conflictIds: string[];
  /** Why the drain ended early (leaving entries pending), or null if it ran to the end. */
  stopped: Exclude<ErrorKind, 'permanent'> | null;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Request timed out')), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Sends pending entries in send order, re-reading the queue as it goes so edits
 * made mid-drain go out in the same pass. Outcomes per entry:
 *  - sent → removed.
 *  - network / transient server error / expired session → stop; it and everything
 *    after stay pending for the next attempt (transient ones count an attempt).
 *  - server refused it (4xx) → 'failed' with the server's message; carry on.
 *  - server numbers moved while offline → 'conflict'; carry on.
 */
export async function drain(handlers: SyncHandlers, opts: DrainOptions = {}): Promise<DrainResult> {
  const store = opts.store ?? defaultQueueStore;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_SEND_TIMEOUT_MS;
  const result: DrainResult = { syncedIds: [], failedIds: [], conflictIds: [], stopped: null };
  const attempted = new Set<string>();

  for (;;) {
    const item = sendOrder(pendingOnly(await store.load())).find((i) => !attempted.has(i.id));
    if (!item) return result;
    attempted.add(item.id);

    if (opts.checkConflict && item.base) {
      try {
        const conflict = await withTimeout(opts.checkConflict(item), timeoutMs);
        if (conflict && conflict.length) {
          await patchItem(item.id, (i) => ({ ...i, status: 'conflict', conflict }), store);
          result.conflictIds.push(item.id);
          continue;
        }
      } catch (err) {
        const kind = classifyError(err);
        if (kind !== 'permanent') return { ...result, stopped: kind };
        // The check itself was refused (e.g. can't read the record) — don't block the edit on it.
      }
    }

    try {
      await withTimeout(handlers[item.kind](item.key, item.payload, item), timeoutMs);
      await remove(item.id, store);
      result.syncedIds.push(item.id);
    } catch (err) {
      const kind = classifyError(err);
      const lastError = errorMessage(err);
      if (kind === 'permanent') {
        await patchItem(item.id, (i) => ({ ...i, status: 'failed', attempts: i.attempts + 1, lastError }), store);
        result.failedIds.push(item.id);
        continue;
      }
      if (kind === 'retryable') {
        const attempts = item.attempts + 1;
        const giveUp = attempts >= MAX_TRANSIENT_ATTEMPTS;
        await patchItem(item.id, (i) => ({ ...i, attempts, lastError, status: giveUp ? 'failed' : 'pending' }), store);
        if (giveUp) {
          result.failedIds.push(item.id);
          continue;
        }
      }
      return { ...result, stopped: kind };
    }
  }
}
