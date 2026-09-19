/**
 * Small connection pill for the dark top navs: green "Online", amber while
 * changes are waiting/syncing, red "Offline". Tapping it opens the Sync
 * status screen (only wired where a navigator is available — see onPress).
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNetwork } from '@/offline/NetworkContext';
import { useSyncEngine } from '@/offline/SyncContext';
import { syncStatusLabel } from '@/lib/syncLabel';
import { colors, fontSize, radius, spacing } from '@/theme';

export function SyncStatusBadge({ onPress, onLight }: { onPress?: () => void; onLight?: boolean }) {
  const { isOnline } = useNetwork();
  const { isSyncing, pendingCount, failedItems, conflictItems } = useSyncEngine();
  const attention = failedItems.length > 0 || conflictItems.length > 0;
  const dot = !isOnline ? colors.alert : isSyncing || pendingCount > 0 || attention ? colors.pending : colors.success;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[styles.pill, onLight && styles.pillOnLight]}
      accessibilityRole="button"
      accessibilityLabel="Connection status"
    >
      <View style={[styles.dot, { backgroundColor: dot }]} />
      <Text style={[styles.label, onLight && styles.labelOnLight]}>
        {syncStatusLabel({ isOnline, isSyncing, pendingCount, attentionCount: failedItems.length + conflictItems.length })}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm - 2,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: spacing.md,
  },
  pillOnLight: { backgroundColor: colors.surfaceCard, borderWidth: 1, borderColor: colors.line },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { color: colors.white, fontSize: fontSize.sm - 1, fontWeight: '600' },
  labelOnLight: { color: colors.textPrimary },
});
