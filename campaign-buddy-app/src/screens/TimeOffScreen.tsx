import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import * as timeOffApi from '@/api/timeOff';
import { Chip, ChipTone } from '@/components/Chip';
import { TimeOffRequestSheet } from '@/components/TimeOffRequestSheet';
import { colors, fontFamily, fontSize, radius, spacing } from '@/theme';
import { formatDay, ymd } from '@/lib/date';
import type { TimeOffStatus } from '@/api/types';

const STATUS_CHIP: Record<TimeOffStatus, { label: string; tone: ChipTone }> = {
  pending: { label: 'Awaiting approval', tone: 'pending' },
  approved: { label: 'Approved', tone: 'success' },
  declined: { label: 'Declined', tone: 'alert' },
};

const REASON_LABEL: Record<string, string> = {
  sick_leave: 'Sick leave',
  annual_leave: 'Annual leave',
  personal: 'Personal',
  other: 'Other',
};

export function TimeOffScreen() {
  const navigation = useNavigation();
  const [requestSheetVisible, setRequestSheetVisible] = useState(false);

  const balanceQuery = useQuery({ queryKey: ['time-off', 'balance'], queryFn: timeOffApi.getTimeOffBalance });
  const requestsQuery = useQuery({ queryKey: ['time-off', 'requests'], queryFn: timeOffApi.getTimeOffRequests });

  const today = ymd();

  return (
    <SafeAreaView style={styles.frame} edges={['top']}>
      <View style={styles.topnav}>
        <Pressable style={styles.backRow} onPress={() => navigation.goBack()}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path d="M15 5l-7 7 7 7" stroke="#F4F6F3" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
          <View>
            <Text style={styles.title}>Time off</Text>
            <Text style={styles.subtitle}>Requests & leave balance</Text>
          </View>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Only "Pending approval" and "Taken this year" — "Days remaining"
            was deliberately removed from the product, see product notes. */}
        <View style={styles.balanceRow}>
          <Balance n={balanceQuery.data?.pendingCount ?? 0} l="Pending approval" />
          <Balance n={balanceQuery.data?.takenThisYear ?? 0} l="Taken this year" />
        </View>

        <Text style={styles.sectionLabel}>Your requests</Text>
        {requestsQuery.data?.map((req) => (
          <View key={req.id} style={styles.reqCard}>
            <View style={styles.reqTop}>
              <View>
                <Text style={styles.reqReason}>{REASON_LABEL[req.reason] ?? req.reason}</Text>
                <Text style={styles.reqDates}>
                  {formatRange(req.fromDate, req.toDate)} · {req.days} {req.days === 1 ? 'day' : 'days'}
                </Text>
              </View>
              <Chip label={STATUS_CHIP[req.status].label} tone={STATUS_CHIP[req.status].tone} />
            </View>
            <View style={styles.reqMeta}>
              <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
                <Circle cx={12} cy={8} r={3.4} stroke={colors.textMuted} strokeWidth={1.6} />
                <Path d="M5 20c1.5-4 4.2-6 7-6s5.5 2 7 6" stroke={colors.textMuted} strokeWidth={1.6} />
              </Svg>
              <Text style={styles.reqMetaText}>Approver: {req.approverName}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <Pressable style={styles.fab} onPress={() => setRequestSheetVisible(true)}>
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
          <Path d="M12 5v14M5 12h14" stroke="white" strokeWidth={2.2} strokeLinecap="round" />
        </Svg>
      </Pressable>

      <TimeOffRequestSheet
        visible={requestSheetVisible}
        onClose={() => setRequestSheetVisible(false)}
        defaultFromDate={today}
        defaultToDate={today}
      />
    </SafeAreaView>
  );
}

function Balance({ n, l }: { n: number; l: string }) {
  return (
    <View style={styles.balance}>
      <Text style={styles.balanceN}>{n}</Text>
      <Text style={styles.balanceL}>{l}</Text>
    </View>
  );
}

function formatRange(from: string, to: string) {
  const fromYmd = from.slice(0, 10);
  const toYmd = to.slice(0, 10);
  if (fromYmd === toYmd) return formatDay(from);
  return `${formatDay(from, { day: 'numeric', month: 'short' })} – ${formatDay(to)}`;
}

const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: colors.surface },
  topnav: { backgroundColor: colors.ink, paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { fontFamily: fontFamily.display, fontSize: fontSize.lg, color: colors.white },
  subtitle: { color: '#9FB2AA', fontSize: 12.5, marginTop: 2 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl },
  balanceRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  balance: {
    flex: 1,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.md + 1,
  },
  balanceN: { fontFamily: fontFamily.display, fontSize: 22, color: colors.textPrimary },
  balanceL: { fontSize: 11.5, color: colors.textMuted, marginTop: 2 },
  sectionLabel: { fontSize: fontSize.base, fontWeight: '700', marginTop: spacing.xl, marginBottom: spacing.sm },
  reqCard: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line },
  reqTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  reqReason: { fontSize: fontSize.md, fontWeight: '600', color: colors.textPrimary },
  reqDates: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 3 },
  reqMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.sm },
  reqMetaText: { fontSize: 11.5, color: colors.textMuted },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    bottom: spacing.xxl,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.mango,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.mango,
    shadowOpacity: 0.38,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
});
