import { getJSON, setJSON } from './storage';

export interface CacheEntry<T = unknown> {
  payload: T;
  lastSyncedAt: string;
}

export interface CacheStore {
  load: (key: string) => Promise<CacheEntry | null>;
  save: (key: string, entry: CacheEntry) => Promise<void>;
}

const storageKey = (key: string) => `cb_cache_${key}`;

export const defaultCacheStore: CacheStore = {
  load: (key) => getJSON<CacheEntry>(storageKey(key)),
  save: (key, entry) => setJSON(storageKey(key), entry),
};

export async function readCache<T>(key: string, store: CacheStore = defaultCacheStore): Promise<CacheEntry<T> | null> {
  return (await store.load(key)) as CacheEntry<T> | null;
}

export async function writeCache<T>(
  key: string,
  payload: T,
  store: CacheStore = defaultCacheStore,
  now: () => string = () => new Date().toISOString()
): Promise<CacheEntry<T>> {
  const entry: CacheEntry<T> = { payload, lastSyncedAt: now() };
  await store.save(key, entry);
  return entry;
}
