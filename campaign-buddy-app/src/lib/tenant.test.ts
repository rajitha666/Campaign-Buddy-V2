import { describe, it, expect, beforeEach } from 'vitest';
import {
  setCurrentTenant,
  currentTenant,
  deviceStorageKey,
  secureStoreKey,
  scopedKeyTail,
} from './tenant';

/**
 * One store binary talks to many agency servers, so every key on the device has
 * to say which tenant it belongs to. The risk this closes: a queued sales update
 * for one agency flushing to another agency's server.
 * See docs/multi-tenant-release-strategy.md sections 2.1 and 8.
 */
describe('tenant-scoped device storage keys', () => {
  beforeEach(() => setCurrentTenant(null));

  it('leaves keys byte-identical when no tenant is pinned', () => {
    // Pre-multi-tenant installs must keep reading their own data -- a changed
    // key format here would orphan a field rep's queued offline work.
    expect(deviceStorageKey('cb_offline_queue', 'user-1')).toBe('cb_offline_queue:user-1');
    expect(deviceStorageKey('cb_session_user', 'anon', true)).toBe('cb_session_user');
    expect(secureStoreKey('cb_access_token')).toBe('cb_access_token');
  });

  it('namespaces by tenant once one is pinned', () => {
    setCurrentTenant('acme');
    expect(currentTenant()).toBe('acme');
    expect(deviceStorageKey('cb_offline_queue', 'user-1')).toBe('cb_offline_queue@acme:user-1');
    expect(secureStoreKey('cb_access_token')).toBe('cb_access_token@acme');
  });

  it('keeps the session snapshot tenant-scoped but user-agnostic', () => {
    // It has to be readable before we know who is signed in -- but we always
    // know the tenant by then, so it is still namespaced.
    setCurrentTenant('acme');
    expect(deviceStorageKey('cb_session_user', 'anon', true)).toBe('cb_session_user@acme');
  });

  it('never lets two tenants collide on the same user id', () => {
    setCurrentTenant('acme');
    const acme = deviceStorageKey('cb_offline_queue', 'shared-id');
    setCurrentTenant('beta');
    expect(deviceStorageKey('cb_offline_queue', 'shared-id')).not.toBe(acme);
  });

  it('sweeps one tenant cache without touching another for the same rep', () => {
    // removeScopedByPrefix matches on this tail. A bare `:userId` suffix would
    // also match the other agency's keys on a shared handset.
    setCurrentTenant('acme');
    const tail = scopedKeyTail('shared-id');
    expect(tail).toBe('@acme:shared-id');
    expect(deviceStorageKey('cb_cache_outlets', 'shared-id').endsWith(tail)).toBe(true);

    setCurrentTenant('beta');
    expect(deviceStorageKey('cb_cache_outlets', 'shared-id').endsWith(tail)).toBe(false);
  });
});
