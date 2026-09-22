import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '@/navigation/types';
import { useAuth } from '@/context/AuthContext';
import { useAssignment } from '@/context/AssignmentContext';
import { applyDesignationLabel } from '@/lib/designationLabel';
import { useNetwork } from '@/offline/NetworkContext';
import { useSyncEngine } from '@/offline/SyncContext';
import { formatSyncedAgo, syncStatusLabel } from '@/lib/syncLabel';
import { confirmAction } from '@/lib/showAlert';
import { pingCount } from '@/offline/pingBuffer';
import * as queue from '@/offline/queue';
import { openPromoterGuide, openSupervisorGuide } from '@/lib/trainingGuide';
import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { colors, fontFamily, fontSize, spacing } from '@/theme';

export function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const { user, logout } = useAuth();
  const { assignment } = useAssignment();
  const { isOnline } = useNetwork();
  const { isSyncing, pendingCount, failedItems, conflictItems, lastSyncedAt, syncNow } = useSyncEngine();
  // Offline entry (stats/stock/sales) is a promoter flow; supervisors mount
  // Profile as a root tab with no Sync status route.
  const showSyncStatus = user?.role !== 'campaign_owner';
  // Supervisor mode mounts this as a root tab (no back history) instead of
  // pushing it from Home/Attendance, so only show the back chevron when
  // there's actually somewhere to go back to.
  const canGoBack = navigation.canGoBack();

  async function handleLogout() {
    try {
      // Give anything unsynced a chance to reach the server first; if some still can't,
      // say so — those changes stay on this phone and go out at the next sign-in.
      if (isOnline) await syncNow();
      const unsynced = (await queue.list()).length + (await pingCount());
      if (unsynced > 0) {
        const proceed = await confirmAction(
          'Unsynced changes',
          `${unsynced} change${unsynced === 1 ? ' is' : 's are'} still on this phone and not sent yet. They will be kept and sent the next time you sign in on this phone. Log out anyway?`,
          'Log out'
        );
        if (!proceed) return;
      }
      await logout();
      // No manual nav needed — RootNavigator swaps back to AuthStack once
      // AuthContext's `user` becomes null.
    } catch {
      Alert.alert('Something went wrong logging out. Please try again.');
    }
  }

  return (
    <SafeAreaView style={styles.frame} edges={['top']}>
      <View style={styles.topnav}>
        <Pressable style={styles.backRow} onPress={() => canGoBack && navigation.goBack()}>
          {canGoBack ? (
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
              <Path d="M15 5l-7 7 7 7" stroke="#F4F6F3" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          ) : null}
          <View>
            <Text style={styles.title}>Profile</Text>
            <Text style={styles.subtitle}>Account & settings</Text>
          </View>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Avatar initials={user?.avatarInitials ?? '—'} imageUrl={user?.profilePictureUrl} size={76} />
          <Text style={styles.name}>{user?.fullName}</Text>
          <Text style={styles.role}>
            {user?.role === 'campaign_owner'
              ? 'Field Supervisor'
              : applyDesignationLabel('Field Promoter', assignment?.campaign.promoterLabel)}
          </Text>
        </View>

        <Card style={{ marginTop: spacing.xl, paddingVertical: 4, paddingHorizontal: spacing.lg }}>
          <InfoRow k="Employee ID" v={user?.employeeId ?? '—'} />
          <InfoRow k="Phone" v={user?.phone ?? '—'} />
          <InfoRow k="Reports to" v={user?.reportsToName ?? '—'} last />
        </Card>

        {showSyncStatus && (
          <Pressable style={styles.guideRow} onPress={() => navigation.navigate('SyncStatus')}>
            <View style={styles.guideIcon}>
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                <Path d="M4 12a8 8 0 0113.7-5.6L20 8.7M20 4v4.7h-4.7" stroke={colors.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                <Path d="M20 12a8 8 0 01-13.7 5.6L4 15.3M4 20v-4.7h4.7" stroke={colors.ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.guideTitle}>Sync status</Text>
              <Text style={styles.guideSub}>
                {syncStatusLabel({ isOnline, isSyncing, pendingCount, attentionCount: failedItems.length + conflictItems.length })} ·
                Updated {formatSyncedAgo(lastSyncedAt)}
              </Text>
            </View>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Path d="M9 6l6 6-6 6" stroke="#647169" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Pressable>
        )}

        <Pressable style={styles.guideRow} onPress={user?.role === 'campaign_owner' ? openSupervisorGuide : openPromoterGuide}>
          <View style={styles.guideIcon}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Path
                d="M4 5.5A1.5 1.5 0 015.5 4H18a1 1 0 011 1v13a1 1 0 01-1 1H5.5A1.5 1.5 0 014 17.5v-12z"
                stroke={colors.ink}
                strokeWidth={1.8}
                strokeLinejoin="round"
              />
              <Path d="M8 8.5h7M8 12h7" stroke={colors.ink} strokeWidth={1.8} strokeLinecap="round" />
            </Svg>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.guideTitle}>Field guide</Text>
            <Text style={styles.guideSub}>How to run a shift, step by step</Text>
          </View>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <Path d="M9 6l6 6-6 6" stroke="#647169" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </Pressable>

        <Button label="Log out" variant="alert" onPress={handleLogout} style={{ marginTop: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ k, v, last }: { k: string; v: string; last?: boolean }) {
  return (
    <View style={[styles.infoRow, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.infoK}>{k}</Text>
      <Text style={styles.infoV}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: colors.surface },
  topnav: { backgroundColor: colors.ink, paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { fontFamily: fontFamily.display, fontSize: fontSize.lg, color: colors.white },
  subtitle: { color: '#9FB2AA', fontSize: 12.5, marginTop: 2 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl },
  hero: { alignItems: 'center', paddingTop: spacing.lg },
  name: { fontFamily: fontFamily.display, fontSize: fontSize.lg, marginTop: spacing.md, color: colors.textPrimary },
  role: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
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
  guideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
  },
  guideIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideTitle: { fontSize: fontSize.base, fontWeight: '700', color: colors.textPrimary },
  guideSub: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 1 },
});
