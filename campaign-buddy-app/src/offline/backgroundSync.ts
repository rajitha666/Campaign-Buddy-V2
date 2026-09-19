/**
 * Sends queued changes and buffered location points even when the app isn't
 * open — e.g. the rep records offline, closes the app, and signal returns later.
 * The OS decides when to run it (roughly every 15+ minutes, battery permitting),
 * so it's a safety net; the foreground sync engine does the real-time work.
 *
 * Native only. Needs a build that includes expo-background-task; an older
 * binary without it simply skips this (guarded below), nothing else is affected.
 */
import { Platform } from 'react-native';
import { pingCount } from './pingBuffer';
import * as queue from './queue';
import { runSync } from './runSync';
import { loadUserSnapshot } from './sessionSnapshot';
import { setStorageScope } from './storage';

export const BACKGROUND_SYNC_TASK = 'cb-background-sync';
const MINIMUM_INTERVAL_MINUTES = 15;

/** Headless sync pass. Returns whether there was anything to do. */
export async function backgroundSyncOnce(): Promise<boolean> {
  // Signed out (or never signed in): nothing on this phone is ours to send.
  const user = await loadUserSnapshot();
  if (!user) return false;
  setStorageScope(user.id);
  const waiting = queue.pendingOnly(await queue.list()).length > 0 || (await pingCount()) > 0;
  if (!waiting) return false;
  await runSync();
  return true;
}

type Native = {
  tasks: { defineTask: (name: string, fn: () => Promise<unknown>) => void };
  background: {
    BackgroundTaskResult: { Success: unknown; Failed: unknown };
    BackgroundTaskStatus: { Available: unknown };
    getStatusAsync: () => Promise<unknown>;
    registerTaskAsync: (name: string, opts?: { minimumInterval?: number }) => Promise<void>;
  };
};

function loadNative(): Native | null {
  if (Platform.OS === 'web') return null;
  try {
    return { tasks: require('expo-task-manager'), background: require('expo-background-task') };
  } catch {
    return null;
  }
}

// Tasks must be defined at module load (the OS may start the app headless just to run it).
const native = loadNative();
native?.tasks.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    await backgroundSyncOnce();
    return native.background.BackgroundTaskResult.Success;
  } catch {
    return native.background.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundSync(): Promise<void> {
  if (!native) return;
  try {
    if ((await native.background.getStatusAsync()) !== native.background.BackgroundTaskStatus.Available) return;
    await native.background.registerTaskAsync(BACKGROUND_SYNC_TASK, { minimumInterval: MINIMUM_INTERVAL_MINUTES });
  } catch {
    // background execution unavailable (restricted by the OS / user) — foreground sync still works
  }
}
