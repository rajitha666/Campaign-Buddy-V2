import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The OS can start the app headless just to run this task, so no React effect has
 * run and nothing has restored which agency this install is pinned to. If the
 * tenant namespace isn't restored first, every key read here resolves to the
 * unscoped name, the session snapshot comes back empty, and background sync
 * silently stops doing anything on a pinned install.
 */
const order: string[] = [];

// Platform 'web' so loadNative() short-circuits and no native module is required.
vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));

vi.mock('../lib/tenantMigration', () => ({
  loadPinnedTenant: async () => {
    order.push('loadPinnedTenant');
    return 'acme';
  },
}));

let snapshotUser: { id: string } | null = { id: 'user-1' };
vi.mock('./sessionSnapshot', () => ({
  loadUserSnapshot: async () => {
    order.push('loadUserSnapshot');
    return snapshotUser;
  },
}));

vi.mock('./storage', () => ({ setStorageScope: (id: string) => void order.push(`setStorageScope:${id}`) }));
vi.mock('./pingBuffer', () => ({ pingCount: async () => 0 }));
vi.mock('./queue', () => ({ list: async () => [{ id: 'm1' }], pendingOnly: (xs: unknown[]) => xs }));
vi.mock('./runSync', () => ({ runSync: async () => void order.push('runSync') }));

import { backgroundSyncOnce } from './backgroundSync';

beforeEach(() => {
  order.length = 0;
  snapshotUser = { id: 'user-1' };
});

describe('backgroundSyncOnce', () => {
  it('restores the tenant pin before reading anything off the device', async () => {
    await backgroundSyncOnce();
    expect(order.indexOf('loadPinnedTenant')).toBe(0);
    expect(order.indexOf('loadPinnedTenant')).toBeLessThan(order.indexOf('loadUserSnapshot'));
  });

  it('still syncs the queued work it finds', async () => {
    expect(await backgroundSyncOnce()).toBe(true);
    expect(order).toContain('setStorageScope:user-1');
    expect(order).toContain('runSync');
  });

  it('does nothing when nobody is signed in on this phone', async () => {
    snapshotUser = null;
    expect(await backgroundSyncOnce()).toBe(false);
    expect(order).not.toContain('runSync');
  });
});
