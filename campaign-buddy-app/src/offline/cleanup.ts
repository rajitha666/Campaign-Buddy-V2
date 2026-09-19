import { pingCount } from './pingBuffer';
import * as queue from './queue';
import { removeScopedByPrefix } from './storage';

/**
 * On logout, drop the cached copy of the day's data so a shared/lost phone
 * isn't holding it — but never while anything is still waiting to sync:
 * the queue, buffered pings and the cache that shows the rep their own
 * unsynced edits all stay until the next sign-in delivers them.
 */
export async function clearCachedDataIfIdle(): Promise<void> {
  try {
    const waiting = (await queue.list()).length > 0 || (await pingCount()) > 0;
    if (!waiting) await removeScopedByPrefix('cb_cache_');
  } catch {
    // best-effort tidy-up
  }
}
