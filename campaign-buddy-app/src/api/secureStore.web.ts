/**
 * Web token storage. There is no Keychain/Keystore in a browser; localStorage
 * is the pragmatic equivalent for a dev/preview build. Same async API as the
 * native secureStore.ts so call sites don't branch.
 */
export async function getItem(key: string): Promise<string | null> {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

export async function setItem(key: string, value: string): Promise<void> {
  try { window.localStorage.setItem(key, value); } catch { /* private mode */ }
}

export async function deleteItem(key: string): Promise<void> {
  try { window.localStorage.removeItem(key); } catch { /* ignore */ }
}
