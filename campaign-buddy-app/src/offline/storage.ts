/**
 * App data (offline queue, cached server payloads) — AsyncStorage, not
 * SecureStore: it's bulk JSON, not credentials. AsyncStorage has a web
 * implementation (localStorage), so `expo start --web` keeps working.
 *
 * Keys are namespaced by the signed-in user id (setStorageScope, called by
 * AuthContext) so a shared device never syncs one rep's queued edits under
 * another rep's login. The session snapshot itself must be readable before we
 * know who's signed in, so it uses `global: true`.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

let scope = 'anon';

export function setStorageScope(userId: string): void {
  scope = userId;
}

const fullKey = (key: string, global?: boolean) => (global ? key : `${key}:${scope}`);

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

/** Remove every key for the current user whose base name starts with `prefix`. */
export async function removeScopedByPrefix(prefix: string): Promise<void> {
  const suffix = `:${scope}`;
  const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(prefix) && k.endsWith(suffix));
  if (keys.length) await AsyncStorage.multiRemove(keys);
}
