/**
 * GPS pings taken while there's no signal, kept on the phone and uploaded (with
 * their original capture time) once it returns, so the supervisor's tracking
 * trail has no hole. Bounded: a full day at one ping a minute is ~600, so the
 * cap keeps the whole shift while a runaway can't fill storage.
 */
import { isRetryable } from './networkError';
import { getJSON, setJSON } from './storage';

export interface BufferedPing {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  timestamp: string;
  batteryPercent?: number;
}

export interface PingStore {
  load: () => Promise<BufferedPing[]>;
  save: (items: BufferedPing[]) => Promise<void>;
}

const KEY = 'cb_ping_buffer';
const MAX_BUFFERED = 1000;
const DEFAULT_FLUSH_MAX = 200;

export const defaultPingStore: PingStore = {
  load: async () => (await getJSON<BufferedPing[]>(KEY)) ?? [],
  save: (items) => setJSON(KEY, items),
};

let lock: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = lock.then(fn, fn);
  lock = run.catch(() => {});
  return run;
}

export function addPing(ping: BufferedPing, store: PingStore = defaultPingStore, cap = MAX_BUFFERED): Promise<void> {
  return withLock(async () => {
    const items = [...(await store.load()), ping];
    await store.save(items.length > cap ? items.slice(items.length - cap) : items);
  });
}

export const pingCount = async (store: PingStore = defaultPingStore) => (await store.load()).length;

export interface FlushResult {
  sent: number;
  remaining: number;
  /** True when a connection problem ended the flush early. */
  stopped: boolean;
}

/** Upload oldest-first. A refused ping (4xx, e.g. the shift is already closed) is dropped; a connection problem stops the flush. */
export function flushPings(
  send: (ping: BufferedPing) => Promise<void>,
  opts: { store?: PingStore; max?: number } = {}
): Promise<FlushResult> {
  const store = opts.store ?? defaultPingStore;
  const max = opts.max ?? DEFAULT_FLUSH_MAX;
  return withLock(async () => {
    const items = await store.load();
    let done = 0;
    let sent = 0;
    let stopped = false;
    for (const ping of items.slice(0, max)) {
      try {
        await send(ping);
        sent += 1;
      } catch (err) {
        if (isRetryable(err) || (err as { response?: { status?: number } })?.response?.status === 401) {
          stopped = true;
          break;
        }
      }
      done += 1;
    }
    const rest = items.slice(done);
    await store.save(rest);
    return { sent, remaining: rest.length, stopped };
  });
}
