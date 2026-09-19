/**
 * Drains the offline queue and buffered location pings (runSync.ts) whenever the
 * app is online — on mount, on every offline→online flip, on returning to the
 * foreground, and on a backing-off timer while anything is still waiting.
 * Screens save through useOfflineSave; everything that needs progress (badge,
 * Sync status screen, check-out) reads useSyncEngine().
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/Toast';
import { useNetwork } from './NetworkContext';
import { readCache, writeCache } from './cache';
import { retryDelayMs } from './backoff';
import { syncedEvents } from './events';
import { pingCount } from './pingBuffer';
import * as queue from './queue';
import { runSync } from './runSync';
import { syncClock } from './syncClock';
import type { QueuedMutation } from './types';

/** Everything a synced write can change on screen. */
export const SYNC_QUERY_KEYS = [['stats'], ['sales-summary'], ['sales-fields'], ['products'], ['assignment'], ['attendance']];

interface SyncEngineValue {
  /** Every queued entry, in queue order (pending, failed and conflicting). */
  items: QueuedMutation[];
  pendingCount: number;
  failedItems: QueuedMutation[];
  conflictItems: QueuedMutation[];
  /** Location pings recorded offline and not yet uploaded. */
  bufferedPings: number;
  isSyncing: boolean;
  /** ISO time of the last successful contact with the server; null until the first one. */
  lastSyncedAt: string | null;
  /** Tell the engine a save just reached the server directly. */
  markSynced: () => void;
  /** Re-read queue counts after something was enqueued/changed. */
  refreshCounts: () => Promise<void>;
  /** Run a sync pass now (joins one already running). Resolves when it has finished. */
  syncNow: () => Promise<void>;
  retryItem: (id: string) => Promise<void>;
  discardItem: (id: string) => Promise<void>;
  /** 'mine' sends the rep's numbers anyway; 'server' drops the edit and shows what the server holds. */
  resolveConflict: (id: string, keep: 'mine' | 'server') => Promise<void>;
}

const noop = async () => {};
const SyncEngineContext = createContext<SyncEngineValue>({
  items: [],
  pendingCount: 0,
  failedItems: [],
  conflictItems: [],
  bufferedPings: 0,
  isSyncing: false,
  lastSyncedAt: null,
  markSynced: () => {},
  refreshCounts: noop,
  syncNow: noop,
  retryItem: noop,
  discardItem: noop,
  resolveConflict: noop,
});

export function SyncEngineProvider({ children }: { children: React.ReactNode }) {
  const { isOnline } = useNetwork();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [items, setItems] = useState<QueuedMutation[]>([]);
  const [bufferedPings, setBufferedPings] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [failures, setFailures] = useState(0);
  const inFlight = useRef<Promise<void> | null>(null);
  const online = useRef(isOnline);
  online.current = isOnline;

  const refreshCounts = useCallback(async () => {
    setItems(await queue.list());
    setBufferedPings(await pingCount());
  }, []);

  const invalidateAll = useCallback(() => {
    for (const queryKey of SYNC_QUERY_KEYS) queryClient.invalidateQueries({ queryKey });
  }, [queryClient]);

  const markSynced = useCallback(() => {
    writeCache('sync:last', {}).then((entry) => setLastSyncedAt(entry.lastSyncedAt)).catch(() => {});
  }, []);

  // Fresh reads count as contact with the server too (see syncClock.ts).
  useEffect(
    () =>
      syncClock.subscribe((iso) => {
        setLastSyncedAt(iso);
        writeCache('sync:last', {}, undefined, () => iso).catch(() => {});
      }),
    []
  );

  useEffect(() => {
    refreshCounts();
    readCache('sync:last')
      .then((entry) => entry && setLastSyncedAt(entry.lastSyncedAt))
      .catch(() => {});
  }, [refreshCounts]);

  const pass = useCallback(async () => {
    setIsSyncing(true);
    try {
      const { drain, pings } = await runSync();
      const touched = drain.syncedIds.length + drain.failedIds.length + drain.conflictIds.length;
      if (drain.syncedIds.length > 0 || (pings?.sent ?? 0) > 0) markSynced();
      if (touched > 0) {
        invalidateAll();
        syncedEvents.emit();
      }
      await refreshCounts();

      const left = await queue.list();
      const stillWaiting = queue.pendingOnly(left).length > 0;
      if (drain.failedIds.length > 0) {
        showToast(`${drain.failedIds.length === 1 ? 'A change' : `${drain.failedIds.length} changes`} could not be saved — see Sync status`);
      } else if (drain.conflictIds.length > 0) {
        showToast('Some numbers were changed at the office while you were offline — review in Sync status');
      } else if (drain.syncedIds.length > 0 && !stillWaiting && left.length === 0) {
        showToast('All changes synced ✓');
      }
      if (drain.stopped || pings?.stopped) setFailures((n: number) => n + 1);
      else setFailures(0);
    } finally {
      setIsSyncing(false);
    }
  }, [invalidateAll, markSynced, refreshCounts, showToast]);

  const syncNow = useCallback((): Promise<void> => {
    if (!online.current) return Promise.resolve();
    if (!inFlight.current) {
      inFlight.current = pass().finally(() => {
        inFlight.current = null;
      });
    }
    return inFlight.current;
  }, [pass]);

  // On mount and whenever connectivity flips online.
  useEffect(() => {
    if (isOnline) {
      setFailures(0);
      syncNow();
    }
  }, [isOnline, syncNow]);

  // Anything still waiting (a save queued while the phone still reports "online",
  // a struggling server) is retried with backoff: 30s, 1m, 2m … capped at 5m.
  const waiting = items.some((i) => i.status === 'pending') || bufferedPings > 0;
  useEffect(() => {
    if (!isOnline || !waiting || isSyncing) return;
    const timer = setTimeout(syncNow, retryDelayMs(failures));
    return () => clearTimeout(timer);
  }, [isOnline, waiting, isSyncing, failures, syncNow]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncNow();
    });
    return () => sub.remove();
  }, [syncNow]);

  const retryItem = useCallback(
    async (id: string) => {
      await queue.retry(id);
      await refreshCounts();
      syncNow();
    },
    [refreshCounts, syncNow]
  );

  const discardItem = useCallback(
    async (id: string) => {
      await queue.discard(id);
      await refreshCounts();
      invalidateAll(); // drop the optimistic local copy in favour of the server's
    },
    [invalidateAll, refreshCounts]
  );

  const resolveConflict = useCallback(
    async (id: string, keep: 'mine' | 'server') => {
      if (keep === 'server') return discardItem(id);
      await queue.keepMine(id);
      await refreshCounts();
      syncNow();
    },
    [discardItem, refreshCounts, syncNow]
  );

  return (
    <SyncEngineContext.Provider
      value={{
        items,
        pendingCount: queue.pendingOnly(items).length,
        failedItems: queue.failedOnly(items),
        conflictItems: queue.conflictOnly(items),
        bufferedPings,
        isSyncing,
        lastSyncedAt,
        markSynced,
        refreshCounts,
        syncNow,
        retryItem,
        discardItem,
        resolveConflict,
      }}
    >
      {children}
    </SyncEngineContext.Provider>
  );
}

export function useSyncEngine(): SyncEngineValue {
  return useContext(SyncEngineContext);
}
