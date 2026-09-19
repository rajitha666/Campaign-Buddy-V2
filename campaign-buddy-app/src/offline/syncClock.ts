/**
 * "Last updated" on the Sync status screen means the last time this phone
 * successfully talked to the server — a queue drain, a direct save, or a fresh
 * read. Reads fire in bursts, so notifications are throttled.
 */
export type SyncClockListener = (iso: string) => void;

const THROTTLE_MS = 10_000;

export function createSyncClock() {
  const listeners = new Set<SyncClockListener>();
  let last = -Infinity;
  return {
    note(now: number = Date.now()): void {
      if (now - last < THROTTLE_MS) return;
      last = now;
      const iso = new Date(now).toISOString();
      listeners.forEach((l) => l(iso));
    },
    subscribe(listener: SyncClockListener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const syncClock = createSyncClock();
