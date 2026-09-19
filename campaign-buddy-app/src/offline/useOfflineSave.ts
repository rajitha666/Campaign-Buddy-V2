/**
 * Local-first save for the writes that must never depend on the network
 * (stats, sales summary, product stock). The edit is written to the phone and
 * shown in the UI immediately; delivery to the server happens right after, but
 * the rep only ever waits a moment for it:
 *
 *  - reached the server quickly            → 'sent'   ("Saved ✓")
 *  - offline, slow link or server unwell   → 'queued' ("Saved on this phone…") — it keeps retrying
 *  - the server refused it (validation…)   → throws SaveRejectedError with the server's sentence,
 *                                            and the local copy is reverted to the server's
 */
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { localDayKey } from '@/lib/date';
import { getApiErrorMessage } from '@/api/client';
import { useNetwork } from './NetworkContext';
import { SYNC_QUERY_KEYS, useSyncEngine } from './SyncContext';
import { applyQueuedWrite, readBase } from './localApply';
import * as queue from './queue';
import type { QueueKind } from './types';

export type SaveOutcome = 'sent' | 'queued';

/** How long a save waits for the server before settling for "saved on this phone". */
const DELIVER_WAIT_MS = 1_500;

export class SaveRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveRejectedError';
  }
}

export const saveErrorMessage = (err: unknown) => (err instanceof SaveRejectedError ? err.message : getApiErrorMessage(err));

export function useOfflineSave() {
  const { isOnline } = useNetwork();
  const { syncNow, refreshCounts } = useSyncEngine();
  const queryClient = useQueryClient();

  const save = useCallback(
    async (kind: QueueKind, key: string, payload: unknown): Promise<SaveOutcome> => {
      const day = localDayKey();
      const base = await readBase(kind, key, payload, day).catch(() => undefined);
      const entry = await queue.enqueue(kind, key, payload, undefined, { base });
      await applyQueuedWrite(kind, key, payload, day).catch(() => {});
      await refreshCounts();
      if (!isOnline) return 'queued';

      let abandoned = false;
      const deliver = async (): Promise<SaveOutcome> => {
        await syncNow();
        let items = await queue.list();
        // An edit that landed just after a running pass looked at the queue needs one more.
        if (items.some((i) => i.id === entry.id && i.status === 'pending')) {
          await syncNow();
          items = await queue.list();
        }
        const mine = items.find((i) => i.id === entry.id);
        if (!mine) return 'sent';
        if (mine.status === 'failed' && !abandoned) {
          await queue.remove(entry.id);
          await refreshCounts();
          for (const queryKey of SYNC_QUERY_KEYS) queryClient.invalidateQueries({ queryKey });
          throw new SaveRejectedError(mine.lastError ?? 'The server did not accept this change.');
        }
        return 'queued';
      };

      let timer: ReturnType<typeof setTimeout>;
      const slow = new Promise<SaveOutcome>((resolve) => {
        timer = setTimeout(() => {
          abandoned = true;
          resolve('queued');
        }, DELIVER_WAIT_MS);
      });
      const delivery = deliver();
      delivery.catch(() => {}); // a rejection after we stopped waiting is handled by the sync engine's notice
      try {
        return await Promise.race([delivery, slow]);
      } finally {
        clearTimeout(timer!);
      }
    },
    [isOnline, syncNow, refreshCounts, queryClient]
  );

  return { save };
}

export const savedMessage = (outcome: SaveOutcome) =>
  outcome === 'queued' ? 'Saved on this phone — will sync automatically' : 'Saved ✓';
