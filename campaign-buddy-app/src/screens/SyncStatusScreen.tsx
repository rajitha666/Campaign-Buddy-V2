import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { useNetwork } from '@/offline/NetworkContext';
import { useSyncEngine } from '@/offline/SyncContext';
import { describeConflict } from '@/offline/conflict';
import { pendingOnly } from '@/offline/queue';
import type { QueueKind } from '@/offline/types';
import { formatSyncedAgo } from '@/lib/syncLabel';
import { colors, fontFamily, fontSize, spacing } from '@/theme';

const KIND_LABEL: Record<QueueKind, string> = {
  checkIn: 'Check-in',
  stats: "Today's stats",
  salesSummary: 'Daily sales details',
  productStock: 'Product stock update',
  salesConfirm: 'Daily sales confirmation',
  checkOut: 'Check-out',
};

export function SyncStatusScreen() {
  const navigation = useNavigation();
  const { isOnline } = useNetwork();
  const { items, pendingCount, failedItems, conflictItems, bufferedPings, isSyncing, lastSyncedAt, syncNow, retryItem, discardItem, resolveConflict } =
    useSyncEngine();
  const allSynced = isOnline && !isSyncing && items.length === 0 && bufferedPings === 0 && !!lastSyncedAt;

  return (
    <SafeAreaView style={styles.frame} edges={['top']}>
      <View style={styles.topnav}>
        <Pressable style={styles.backRow} onPress={() => navigation.goBack()}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path d="M15 5l-7 7 7 7" stroke="#F4F6F3" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
          <View>
            <Text style={styles.title}>Sync status</Text>
            <Text style={styles.subtitle}>Connection and saved changes</Text>
          </View>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Card style={{ marginTop: spacing.lg, paddingVertical: 4, paddingHorizontal: spacing.lg }}>
          <Row k="Connection" v={isOnline ? 'Online' : 'Offline'} color={isOnline ? colors.success : colors.alert} />
          <Row k="Last updated" v={formatSyncedAgo(lastSyncedAt)} last={bufferedPings === 0} />
          <Row k="Waiting to sync" v={String(pendingCount)} last={bufferedPings === 0} />
          {bufferedPings > 0 ? <Row k="Location points waiting" v={String(bufferedPings)} last /> : null}
        </Card>

        {allSynced ? (
          <View style={styles.okBox}>
            <Text style={styles.okText}>Everything is up to date ✓</Text>
          </View>
        ) : null}

        {!isOnline ? (
          <View style={styles.warnBox}>
            <Text style={styles.warnText}>
              You are offline. Keep checking in, entering stats, stock and sales — they are saved on this phone and
              sync automatically when the connection is back.
            </Text>
          </View>
        ) : null}

        {conflictItems.length > 0 ? (
          <View style={{ marginTop: spacing.xl }}>
            <Text style={styles.sectionLabel}>Changed at the office while you were offline</Text>
            {conflictItems.map((item) => (
              <View key={item.id} style={styles.conflictRow}>
                <Text style={styles.conflictTitle}>{KIND_LABEL[item.kind]}</Text>
                <Text style={styles.conflictReason}>{describeConflict(item.conflict ?? [])}</Text>
                <View style={styles.actions}>
                  <ActionButton label="Use office numbers" onPress={() => resolveConflict(item.id, 'server')} />
                  <ActionButton label="Keep mine" primary onPress={() => resolveConflict(item.id, 'mine')} />
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {failedItems.length > 0 ? (
          <View style={{ marginTop: spacing.xl }}>
            <Text style={styles.sectionLabel}>Could not be saved to the server</Text>
            {failedItems.map((item) => (
              <View key={item.id} style={styles.failRow}>
                <Text style={styles.failTitle}>{KIND_LABEL[item.kind]}</Text>
                <Text style={styles.failReason}>{item.lastError ?? 'Rejected by the server'}</Text>
                <View style={styles.actions}>
                  <ActionButton label="Discard" onPress={() => discardItem(item.id)} />
                  <ActionButton label="Try again" primary onPress={() => retryItem(item.id)} />
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {pendingOnly(items).length > 0 ? (
          <View style={{ marginTop: spacing.xl }}>
            <Text style={styles.sectionLabel}>Waiting to be sent</Text>
            {pendingOnly(items).map((item) => (
              <View key={item.id} style={styles.pendingRow}>
                <Text style={styles.pendingTitle}>{KIND_LABEL[item.kind]}</Text>
                <Text style={styles.pendingSub}>
                  {item.attempts > 0 ? `Tried ${item.attempts} time${item.attempts === 1 ? '' : 's'} · ` : ''}
                  saved {formatSyncedAgo(item.createdAt).toLowerCase()}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <Button
          label={isSyncing ? 'Syncing…' : 'Sync now'}
          onPress={syncNow}
          loading={isSyncing}
          disabled={!isOnline || (pendingCount === 0 && bufferedPings === 0)}
          style={{ marginTop: spacing.xl }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ k, v, last, color }: { k: string; v: string; last?: boolean; color?: string }) {
  return (
    <View style={[styles.infoRow, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.infoK}>{k}</Text>
      <Text style={[styles.infoV, color ? { color } : null]}>{v}</Text>
    </View>
  );
}

function ActionButton({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[styles.actionBtn, primary && styles.actionBtnPrimary]} accessibilityRole="button">
      <Text style={[styles.actionLabel, primary && styles.actionLabelPrimary]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: colors.surface },
  topnav: { backgroundColor: colors.ink, paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { fontFamily: fontFamily.display, fontSize: fontSize.lg, color: colors.white },
  subtitle: { color: '#9FB2AA', fontSize: 12.5, marginTop: 2 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md + 1,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  infoK: { fontSize: fontSize.base, color: colors.textMuted },
  infoV: { fontSize: fontSize.base, fontWeight: '600', color: colors.textPrimary },
  okBox: { backgroundColor: colors.successTint, borderRadius: 12, padding: spacing.md, marginTop: spacing.lg },
  okText: { color: colors.success, fontSize: fontSize.sm, fontWeight: '700', textAlign: 'center' },
  warnBox: { backgroundColor: colors.pendingTint, borderRadius: 12, padding: spacing.md, marginTop: spacing.lg },
  warnText: { color: colors.pending, fontSize: fontSize.sm, fontWeight: '600' },
  sectionLabel: { fontSize: fontSize.base, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
  conflictRow: { backgroundColor: colors.pendingTint, borderRadius: 12, padding: spacing.md, marginTop: spacing.sm },
  conflictTitle: { fontSize: fontSize.base, fontWeight: '700', color: colors.pending },
  conflictReason: { fontSize: fontSize.sm, color: colors.pending, marginTop: 2 },
  failRow: { backgroundColor: colors.alertTint, borderRadius: 12, padding: spacing.md, marginTop: spacing.sm },
  failTitle: { fontSize: fontSize.base, fontWeight: '700', color: colors.alert },
  failReason: { fontSize: fontSize.sm, color: colors.alert, marginTop: 2 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.md },
  actionBtn: {
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surfaceCard,
    borderRadius: 10,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  actionBtnPrimary: { backgroundColor: colors.ink, borderColor: colors.ink },
  actionLabel: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink },
  actionLabelPrimary: { color: colors.white },
  pendingRow: {
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  pendingTitle: { fontSize: fontSize.base, fontWeight: '600', color: colors.textPrimary },
  pendingSub: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
});
