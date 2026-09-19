import { describe, it, expect } from 'vitest';
import { formatSyncedAgo, syncStatusLabel } from './syncLabel';

const NOW = Date.parse('2026-09-18T10:00:00.000Z');

describe('formatSyncedAgo', () => {
  it('says so when nothing has synced yet', () => {
    expect(formatSyncedAgo(null, NOW)).toBe('Not synced yet');
  });

  it('is relative for recent syncs', () => {
    expect(formatSyncedAgo('2026-09-18T09:59:40.000Z', NOW)).toBe('Just now');
    expect(formatSyncedAgo('2026-09-18T09:55:00.000Z', NOW)).toBe('5 min ago');
    expect(formatSyncedAgo('2026-09-18T07:00:00.000Z', NOW)).toBe('3 h ago');
  });
});

describe('syncStatusLabel', () => {
  it('prioritises offline, then syncing, then pending, then all synced', () => {
    expect(syncStatusLabel({ isOnline: false, isSyncing: false, pendingCount: 2 })).toBe('Offline · 2 waiting to sync');
    expect(syncStatusLabel({ isOnline: false, isSyncing: false, pendingCount: 0 })).toBe('Offline');
    expect(syncStatusLabel({ isOnline: true, isSyncing: true, pendingCount: 2 })).toBe('Syncing…');
    expect(syncStatusLabel({ isOnline: true, isSyncing: false, pendingCount: 1 })).toBe('1 waiting to sync');
    expect(syncStatusLabel({ isOnline: true, isSyncing: false, pendingCount: 0 })).toBe('Online');
  });

  it('flags changes that need the rep, once nothing is left to send', () => {
    expect(syncStatusLabel({ isOnline: true, isSyncing: false, pendingCount: 0, attentionCount: 2 })).toBe('2 need attention');
    expect(syncStatusLabel({ isOnline: true, isSyncing: false, pendingCount: 0, attentionCount: 1 })).toBe('1 needs attention');
    expect(syncStatusLabel({ isOnline: true, isSyncing: false, pendingCount: 3, attentionCount: 1 })).toBe('3 waiting to sync');
  });
});
