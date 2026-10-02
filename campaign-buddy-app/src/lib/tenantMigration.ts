/**
 * Pinning this install to an agency, and moving existing data into that
 * agency's namespace.
 *
 * Device keys are unscoped until a tenant is pinned (see lib/tenant.ts), which
 * is what keeps pre-multi-tenant installs working untouched. The moment a tenant
 * *is* pinned, every key moves -- and an unmigrated `cb_offline_queue` is a field
 * rep's queued sales and attendance work, orphaned silently rather than failing
 * loudly. Unmigrated tokens would log them out mid-shift.
 *
 * So the order is: record the pin, then move. The pin is the durable intent and
 * the move is idempotent, so a process killed mid-migration finishes it on the
 * next launch rather than leaving data stranded at keys nothing reads.
 *
 * See docs/multi-tenant-release-strategy.md Phase 1.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getItem, setItem, deleteItem } from '../api/secureStore';
import { currentTenant, setCurrentTenant } from './tenant';

/** Which agency this install is pinned to. Never namespaced itself. */
export const TENANT_PIN_KEY = 'cb_tenant_pin';

/** Every key this app owns. AsyncStorage is app-private, but be explicit anyway. */
const OWNED_PREFIX = 'cb_';

/**
 * SecureStore keys that carry the tenant namespace. Credentials, plus the
 * session snapshot -- which holds the rep's name and phone and their shift
 * state, so it must not be readable across agencies on a shared handset.
 */
const SECURE_BASE_KEYS = [
  'cb_access_token',
  'cb_refresh_token',
  'cb_session_user',
  'cb_session_attendance',
];

/** `cb_offline_queue:user-1` -> `cb_offline_queue@acme:user-1` (and bare keys too). */
function scopedTarget(key: string, slug: string): string {
  const i = key.indexOf(':');
  return i < 0 ? `${key}@${slug}` : `${key.slice(0, i)}@${slug}${key.slice(i)}`;
}

/**
 * Move every unscoped key into `slug`'s namespace. Safe to call repeatedly: a
 * key that already carries an `@tenant` namespace is left alone, and when both a
 * source and its target exist the target wins (it is the newer, migrated copy)
 * and the stale source is dropped.
 *
 * Writes the target before deleting the source, so an interruption leaves a
 * duplicate to clean up rather than a hole.
 */
export async function migrateUnscopedKeysTo(slug: string): Promise<void> {
  const allKeys = await AsyncStorage.getAllKeys();
  const existing = new Set(allKeys);
  const sources = allKeys.filter(
    (k) => k.startsWith(OWNED_PREFIX) && !k.includes('@') && k !== TENANT_PIN_KEY
  );

  if (sources.length) {
    const writes: [string, string][] = [];
    for (const [key, value] of await AsyncStorage.multiGet(sources)) {
      if (value == null) continue;
      const target = scopedTarget(key, slug);
      if (!existing.has(target)) writes.push([target, value]);
    }
    if (writes.length) await AsyncStorage.multiSet(writes);
    await AsyncStorage.multiRemove(sources);
  }

  for (const base of SECURE_BASE_KEYS) {
    const value = await getItem(base);
    if (value == null) continue;
    const target = `${base}@${slug}`;
    if ((await getItem(target)) == null) await setItem(target, value);
    await deleteItem(base);
  }
}

/**
 * Point this install at an agency. Records the pin first so the migration can be
 * resumed, then moves the data, then switches the in-memory namespace.
 */
export async function pinTenant(slug: string): Promise<void> {
  if (currentTenant() === slug) return;
  await AsyncStorage.setItem(TENANT_PIN_KEY, slug);
  await migrateUnscopedKeysTo(slug);
  setCurrentTenant(slug);
}

/**
 * Restore the pin at startup, finishing any migration that was interrupted.
 * Must run before anything reads device storage. Returns null on an install that
 * has never been pinned, which keeps every key in its pre-multi-tenant shape.
 */
export async function loadPinnedTenant(): Promise<string | null> {
  const slug = await AsyncStorage.getItem(TENANT_PIN_KEY);
  if (!slug) return null;
  await migrateUnscopedKeysTo(slug);
  setCurrentTenant(slug);
  return slug;
}
