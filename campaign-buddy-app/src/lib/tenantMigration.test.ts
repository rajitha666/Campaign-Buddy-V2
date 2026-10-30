import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The moment an existing install pins a tenant for the first time, every key on
 * the device moves into the tenant namespace. An unmigrated `cb_offline_queue`
 * is a field rep's queued sales and attendance work -- orphaned silently rather
 * than failing loudly -- and unmigrated tokens log them out mid-shift. So the
 * move has to be crash-safe and idempotent.
 * See docs/multi-tenant-release-strategy.md Phase 1.
 */

// --- in-memory AsyncStorage -------------------------------------------------
const store = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getAllKeys: async () => [...store.keys()],
    getItem: async (k: string) => store.get(k) ?? null,
    setItem: async (k: string, v: string) => void store.set(k, v),
    removeItem: async (k: string) => void store.delete(k),
    multiGet: async (ks: string[]) => ks.map((k) => [k, store.get(k) ?? null]),
    multiSet: async (pairs: [string, string][]) => pairs.forEach(([k, v]) => store.set(k, v)),
    multiRemove: async (ks: string[]) => ks.forEach((k) => store.delete(k)),
  },
}));

// --- in-memory SecureStore --------------------------------------------------
const secure = new Map<string, string>();
vi.mock('../api/secureStore', () => ({
  getItem: async (k: string) => secure.get(k) ?? null,
  setItem: async (k: string, v: string) => void secure.set(k, v),
  deleteItem: async (k: string) => void secure.delete(k),
}));

import { setCurrentTenant, currentTenant, deviceStorageKey, secureStoreKey } from './tenant';
import {
  pinTenant,
  loadPinnedTenant,
  migrateUnscopedKeysTo,
  TENANT_PIN_KEY,
} from './tenantMigration';

beforeEach(() => {
  store.clear();
  secure.clear();
  setCurrentTenant(null);
});

describe('migrateUnscopedKeysTo', () => {
  it("moves a rep's queued offline work into the namespace and clears the source", async () => {
    store.set('cb_offline_queue:user-1', '[{"id":"m1"}]');
    store.set('cb_cache_outlets:user-1', '{"payload":[]}');
    store.set('cb_ping_buffer:user-1', '[1,2]');

    await migrateUnscopedKeysTo('acme');

    expect(store.get('cb_offline_queue@acme:user-1')).toBe('[{"id":"m1"}]');
    expect(store.get('cb_cache_outlets@acme:user-1')).toBe('{"payload":[]}');
    expect(store.get('cb_ping_buffer@acme:user-1')).toBe('[1,2]');
    expect(store.has('cb_offline_queue:user-1')).toBe(false);
  });

  it('moves the credentials and the session snapshot, so nobody is logged out', async () => {
    secure.set('cb_access_token', 'at');
    secure.set('cb_refresh_token', 'rt');
    secure.set('cb_session_user', '{"id":"user-1"}');
    secure.set('cb_session_attendance', '{"userId":"user-1"}');

    await migrateUnscopedKeysTo('acme');

    expect(secure.get('cb_access_token@acme')).toBe('at');
    expect(secure.get('cb_refresh_token@acme')).toBe('rt');
    expect(secure.get('cb_session_user@acme')).toBe('{"id":"user-1"}');
    expect(secure.get('cb_session_attendance@acme')).toBe('{"userId":"user-1"}');
    expect(secure.has('cb_access_token')).toBe(false);
  });

  it('is idempotent, and an existing target wins over a leftover source', async () => {
    store.set('cb_offline_queue@acme:user-1', '["already-migrated"]');
    store.set('cb_offline_queue:user-1', '["stale-source"]');

    await migrateUnscopedKeysTo('acme');
    await migrateUnscopedKeysTo('acme');

    expect(store.get('cb_offline_queue@acme:user-1')).toBe('["already-migrated"]');
    expect(store.has('cb_offline_queue:user-1')).toBe(false);
  });

  it("never touches another tenant's keys, or the pin itself", async () => {
    store.set('cb_offline_queue@beta:user-1', '["betas"]');
    store.set(TENANT_PIN_KEY, 'acme');

    await migrateUnscopedKeysTo('acme');

    expect(store.get('cb_offline_queue@beta:user-1')).toBe('["betas"]');
    expect(store.get(TENANT_PIN_KEY)).toBe('acme');
    expect(store.has(`${TENANT_PIN_KEY}@acme`)).toBe(false);
  });
});

describe('pinTenant / loadPinnedTenant', () => {
  it('pins, migrates, and leaves the data readable through the scoped keys', async () => {
    store.set('cb_offline_queue:user-1', '[{"id":"m1"}]');

    await pinTenant('acme');

    expect(currentTenant()).toBe('acme');
    expect(store.get(TENANT_PIN_KEY)).toBe('acme');
    expect(store.get(deviceStorageKey('cb_offline_queue', 'user-1'))).toBe('[{"id":"m1"}]');
  });

  it('records the pin before moving anything, so a crash mid-migration resumes', async () => {
    // Simulate dying after the pin was written but before the move finished:
    // the queue is still at its unscoped key on the next launch.
    store.set(TENANT_PIN_KEY, 'acme');
    store.set('cb_offline_queue:user-1', '[{"id":"m1"}]');
    secure.set('cb_access_token', 'at');

    const slug = await loadPinnedTenant();

    expect(slug).toBe('acme');
    expect(currentTenant()).toBe('acme');
    // Resumed: the rep's queued work and session survived the interruption.
    expect(store.get(deviceStorageKey('cb_offline_queue', 'user-1'))).toBe('[{"id":"m1"}]');
    expect(secure.get(secureStoreKey('cb_access_token'))).toBe('at');
  });

  it('stays unpinned when nothing was ever pinned', async () => {
    expect(await loadPinnedTenant()).toBeNull();
    expect(currentTenant()).toBeNull();
    // Keys stay in their pre-multi-tenant shape.
    expect(deviceStorageKey('cb_offline_queue', 'user-1')).toBe('cb_offline_queue:user-1');
  });
});
