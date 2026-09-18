import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { HomeStackParamList } from '@/navigation/types';
import * as statsApi from '@/api/stats';
import * as salesFieldsApi from '@/api/salesFields';
import * as salesSummaryApi from '@/api/salesSummary';
import { Stepper } from '@/components/Stepper';
import { Button } from '@/components/Button';
import { CheckInRequiredNotice } from '@/components/CheckInRequiredNotice';
import { useAttendance } from '@/context/AttendanceContext';
import { colors, fontFamily, fontSize, radius, spacing } from '@/theme';
import { getApiErrorMessage } from '@/api/client';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'StatsUpdate'>;

export function StatsUpdateScreen() {
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const { checkedIn } = useAttendance();
  const statsQuery = useQuery({ queryKey: ['stats', 'today'], queryFn: statsApi.getTodayStats });
  // Tester count (client doc D) — a campaign-toggled day-scope custom field,
  // not a DailyStats column, but reps enter it the same way as footfall/
  // approached/conversion, so it gets the same Stepper UI here rather than a
  // plain text box buried in the Daily Sales screen's "Additional details".
  const salesFieldsQuery = useQuery({ queryKey: ['sales-fields'], queryFn: salesFieldsApi.getSalesFields });
  const testerField = salesFieldsQuery.data?.day.find((f) => f.key === 'tester');

  // Local editable copies — seeded from the fetched values once loaded.
  // (Not using useState(statsQuery.data) directly since that data may
  // arrive after first render; see the useEffect-free sync below instead.)
  const [footFall, setFootFall] = useState<number | null>(null);
  const [approached, setApproached] = useState<number | null>(null);
  const [converted, setConverted] = useState<number | null>(null);
  const [tester, setTester] = useState<number | null>(null);

  if (statsQuery.data && footFall === null) {
    setFootFall(statsQuery.data.footFall);
    setApproached(statsQuery.data.approached);
    setConverted(statsQuery.data.converted);
  }
  if (testerField && tester === null) {
    setTester(typeof testerField.value === 'number' ? testerField.value : 0);
  }

  const conversionRate =
    approached && approached > 0 ? Math.round(((converted ?? 0) / approached) * 100) : 0;

  const saveMutation = useMutation({
    mutationFn: () =>
      Promise.all([
        statsApi.updateTodayStats({
          footFall: footFall ?? undefined,
          approached: approached ?? undefined,
          converted: converted ?? undefined,
        }),
        testerField ? salesSummaryApi.updateSalesSummary({ customFields: { tester: tester ?? 0 } }) : null,
      ]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stats', 'today'] });
      queryClient.invalidateQueries({ queryKey: ['sales-fields'] });
      queryClient.invalidateQueries({ queryKey: ['sales-summary', 'today'] });
      navigation.goBack();
    },
    onError: (err) => Alert.alert('Could not save', getApiErrorMessage(err)),
  });

  if (footFall === null || approached === null || converted === null) {
    return <SafeAreaView style={styles.frame} />;
  }

  return (
    <SafeAreaView style={styles.frame} edges={['top']}>
      <View style={styles.topnav}>
        <Pressable style={styles.backRow} onPress={() => navigation.goBack()}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path d="M15 5l-7 7 7 7" stroke="#F4F6F3" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
          <View>
            <Text style={styles.title}>Update today's stats</Text>
            <Text style={styles.subtitle}>{new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
          </View>
        </Pressable>
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        enableOnAndroid
        extraScrollHeight={24}
        keyboardShouldPersistTaps="handled"
      >
        <MetricCard
          iconBg={colors.infoTint}
          icon={
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Path d="M4 21c1.5-4 4.2-6 8-6s6.5 2 8 6" stroke={colors.info} strokeWidth={1.8} strokeLinecap="round" />
              <Circle cx={12} cy={8} r={3.4} stroke={colors.info} strokeWidth={1.8} />
            </Svg>
          }
          title="Foot fall"
          subtitle="Shoppers who entered the outlet"
        >
          <Stepper value={footFall} onChange={setFootFall} size="large" disabled={!checkedIn} />
        </MetricCard>

        <MetricCard
          iconBg={colors.pendingTint}
          icon={
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Path d="M8 12h8M8 8h8M8 16h5" stroke={colors.pending} strokeWidth={1.8} strokeLinecap="round" />
            </Svg>
          }
          title="Approached"
          subtitle="Shoppers engaged by the team"
        >
          <Stepper value={approached} onChange={setApproached} size="large" disabled={!checkedIn} />
        </MetricCard>

        <MetricCard
          iconBg={colors.successTint}
          icon={
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Path d="M5 13l4 4L19 7" stroke={colors.success} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          }
          title="Conversion"
          subtitle="Approached shoppers who purchased"
        >
          <Stepper value={converted} onChange={setConverted} max={approached} size="large" disabled={!checkedIn} />
        </MetricCard>

        {testerField && tester !== null && (
          <MetricCard
            iconBg={colors.pendingTint}
            icon={
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M9 3h6M10 3v5l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"
                  stroke={colors.pending}
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            }
            title="Tester"
            subtitle="Units given away as samples"
          >
            <Stepper value={tester} onChange={setTester} size="large" disabled={!checkedIn} />
          </MetricCard>
        )}

        <View style={styles.convSummary}>
          <Text style={styles.convLabel}>Conversion rate</Text>
          <Text style={styles.convValue}>{conversionRate}% of approached</Text>
        </View>

        {!checkedIn && <CheckInRequiredNotice />}

        <Button
          label="Update"
          onPress={() => saveMutation.mutate()}
          loading={saveMutation.isPending}
          disabled={!checkedIn}
          style={{ marginTop: spacing.xl }}
        />
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

function MetricCard({
  iconBg,
  icon,
  title,
  subtitle,
  children,
}: {
  iconBg: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.metricCard}>
      <View style={styles.metricTop}>
        <View style={[styles.metricIcon, { backgroundColor: iconBg }]}>{icon}</View>
        <View style={{ flex: 1 }}>
          <Text style={styles.metricTitle}>{title}</Text>
          <Text style={styles.metricSub}>{subtitle}</Text>
        </View>
      </View>
      <View style={styles.metricStepperRow}>{children}</View>
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
  metricCard: {
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  metricTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  metricIcon: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  metricTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary },
  metricSub: { fontSize: 11.5, color: colors.textMuted, marginTop: 1 },
  metricStepperRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.lg },
  convSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.successTint,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  convLabel: { fontSize: 12.5, fontWeight: '600', color: colors.success },
  convValue: { fontFamily: fontFamily.display, fontSize: fontSize.lg, color: colors.success },
});
