export function formatSyncedAgo(iso: string | null, now: number = Date.now()): string {
  if (!iso) return 'Not synced yet';
  const minutes = Math.floor((now - Date.parse(iso)) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export function syncStatusLabel(s: {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  /** Failed or conflicting changes that need the rep to act. */
  attentionCount?: number;
}): string {
  if (!s.isOnline) return s.pendingCount > 0 ? `Offline · ${s.pendingCount} waiting to sync` : 'Offline';
  if (s.isSyncing) return 'Syncing…';
  if (s.pendingCount > 0) return `${s.pendingCount} waiting to sync`;
  if (s.attentionCount) return `${s.attentionCount} ${s.attentionCount === 1 ? 'needs' : 'need'} attention`;
  return 'Online';
}
