/**
 * App data (offline queue, cached server payloads) — AsyncStorage, not
 * SecureStore: it's bulk JSON, not credentials. AsyncStorage has a web
 * implementation (localStorage), so `expo start --web` keeps working.
 *
 * Keys are namespaced by tenant (see lib/tenant.ts) and by the signed-in user
 * id (setStorageScope, called by AuthContext) so a shared device never syncs
 * one rep's queued edits under another rep's login, or one agency's edits to
 * another agency's server.
 *
 * `global: true` drops the user scope but keeps the tenant namespace, for data
 * that has to be readable before we know who's signed in. Nothing passes it
 * today -- the session snapshot it was added for now lives in SecureStore
 * (offline/sessionSnapshot.ts).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { deviceStorageKey, scopedKeyTail } from '../lib/tenant';

let scope = 'anon';

export function setStorageScope(userId: string): void {
  scope = userId;
}

const fullKey = (key: string, global?: boolean) => deviceStorageKey(key, scope, global);

export async function getJSON<T>(key: string, global = false): Promise<T | null> {
  const raw = await AsyncStorage.getItem(fullKey(key, global));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export const setJSON = (key: string, value: unknown, global = false) =>
  AsyncStorage.setItem(fullKey(key, global), JSON.stringify(value));

export const removeItem = (key: string, global = false) => AsyncStorage.removeItem(fullKey(key, global));

/** Remove every key for the current tenant + user whose base name starts with `prefix`. */
export async function removeScopedByPrefix(prefix: string): Promise<void> {
  // Match on the whole `@tenant:userId` tail, not just the trailing user id:
  // a bare `:${scope}` suffix would also sweep another tenant's keys for the
  // same rep on a shared handset.
  const tail = scopedKeyTail(scope);
  const keys = (await AsyncStorage.getAllKeys()).filter(
    (k) => k.endsWith(tail) && k.slice(0, -tail.length).startsWith(prefix)
  );
  if (keys.length) await AsyncStorage.multiRemove(keys);
}
