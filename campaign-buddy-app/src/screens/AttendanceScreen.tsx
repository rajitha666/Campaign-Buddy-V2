import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import type { AttendanceStackParamList } from '@/navigation/types';
import { useAttendance } from '@/context/AttendanceContext';
import * as profileApi from '@/api/profile';
import * as attendanceApi from '@/api/attendance';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { CheckoutConfirmSheet } from '@/components/CheckoutConfirmSheet';
import { colors, fontFamily, fontSize, radius, spacing } from '@/theme';
import { getApiErrorMessage } from '@/api/client';
import { formatDay } from '@/lib/date';
import type { AttendanceStatus } from '@/api/types';

type Nav = NativeStackNavigationProp<AttendanceStackParamList, 'Attendance'>;

export function AttendanceScreen() {
  const navigation = useNavigation<Nav>();
  const { checkedIn, checkInAt, checkIn, refresh } = useAttendance();
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkoutSheetVisible, setCheckoutSheetVisible] = useState(false);
  const [elapsed, setElapsed] = useState('');

  const assignmentQuery = useQuery({ queryKey: ['assignment', 'today'], queryFn: profileApi.getTodayAssignment });
  const historyQuery = useQuery({ queryKey: ['attendance', 'history'], queryFn: () => attendanceApi.getAttendanceHistory('week') });

  // Live "on shift for Xh Ym" ticker, matching the mockup's `.timer` text.
  useEffect(() => {
    if (!checkedIn || !checkInAt) return;
    function tick() {
      const ms = Date.now() - new Date(checkInAt!).getTime();
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      setElapsed(`${h}h ${m}m`);
    }
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [checkedIn, checkInAt]);

  async function handleCheckIn() {
    if (!assignmentQuery.data) return;
    setCheckingIn(true);
    try {
      await checkIn(assignmentQuery.data.assignmentId);
    } catch (err) {
      Alert.alert('Could not check in', getApiErrorMessage(err));
    } finally {
      setCheckingIn(false);
    }
  }

  return (
    <SafeAreaView style={styles.frame} edges={['top']}>
      <View style={styles.topnav}>
        <Text style={styles.title}>Attendance</Text>
        <Text style={styles.subtitle}>
          {assignmentQuery.data ? `${assignmentQuery.data.campaign.name} · ${assignmentQuery.data.outlet.name}` : ' '}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {checkedIn ? (
          <View style={styles.hero}>
            <View style={[styles.ring, { backgroundColor: colors.successTint }]}>
              <View style={[styles.ringInner, { backgroundColor: colors.success }]}>
                <Svg width={30} height={30} viewBox="0 0 24 24" fill="none">
                  <Path d="M5 13l4 4L19 7" stroke="white" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
                <Text style={styles.ringLabel}>Checked in</Text>
              </View>
            </View>
            <Text style={styles.timer}>
              On shift for <Text style={styles.timerBold}>{elapsed}</Text>
            </Text>
            <LocationRow label="Location verified at check-in" />
          </View>
        ) : (
          <View style={styles.hero}>
            <Pressable
              style={[styles.ring, { backgroundColor: colors.mangoTint }]}
              onPress={handleCheckIn}
              disabled={checkingIn}
            >
              <View style={[styles.ringInner, { backgroundColor: colors.mango }]}>
                <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
                  <Path d="M12 21s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z" stroke="white" strokeWidth={2.2} />
                  <Circle cx={12} cy={9} r={2.4} stroke="white" strokeWidth={2.2} />
                </Svg>
                <Text style={styles.ringLabel}>Check in</Text>
                <Text style={styles.ringSub}>Tap to start your shift</Text>
              </View>
            </Pressable>
            <Text style={styles.timer}>Shift not started yet</Text>
            <LocationRow label="Your location will be verified at check-in" />
          </View>
        )}

        {checkedIn ? (
          <Button
            label="Check out"
            variant="alert"
            onPress={() => setCheckoutSheetVisible(true)}
            style={{ marginTop: spacing.xl }}
          />
        ) : (
          <Button label="Check in" onPress={handleCheckIn} loading={checkingIn} style={{ marginTop: spacing.xl }} />
        )}

        <Pressable style={styles.linkRow} onPress={() => navigation.navigate('TimeOff')}>
          <View style={styles.linkIcon}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Circle cx={12} cy={12} r={8} stroke={colors.info} strokeWidth={1.8} />
              <Path d="M12 8v4l3 2" stroke={colors.info} strokeWidth={1.8} strokeLinecap="round" />
            </Svg>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.linkTitle}>Request time off</Text>
            <Text style={styles.linkSub}>Submit a leave request for approval</Text>
          </View>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <Path d="M9 6l6 6-6 6" stroke="#B7C0BA" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </Pressable>

        <Text style={styles.sectionLabel}>This week</Text>
        {historyQuery.data?.map((entry) => (
          <View key={entry.date} style={styles.histItem}>
            <View>
              <Text style={styles.histDay}>
                {formatDay(entry.date, { weekday: 'long', day: 'numeric', month: 'short' })}
              </Text>
              <Text style={styles.histTime}>{formatHistoryTime(entry)}</Text>
            </View>
            {statusChip(entry.status)}
          </View>
        ))}
      </ScrollView>

      <CheckoutConfirmSheet
        visible={checkoutSheetVisible}
        onClose={() => {
          setCheckoutSheetVisible(false);
          refresh();
        }}
      />
    </SafeAreaView>
  );
}

function formatHistoryTime(entry: { checkInAt: string | null; checkOutAt: string | null; leaveReason?: string; status: AttendanceStatus }) {
  if (entry.status === 'leave') return entry.leaveReason ?? 'Leave';
  if (!entry.checkInAt) return 'Not checked in yet';
  const inTime = new Date(entry.checkInAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (!entry.checkOutAt) return `In ${inTime}`;
  const outTime = new Date(entry.checkOutAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `In ${inTime} · Out ${outTime}`;
}

// Only "on_time" and "leave" get a chip in the redesign — "late"/"absent"/
// "pending" render with no chip at all, matching the product decision to
// drop the "Late" tag from the history list.
function statusChip(status: AttendanceStatus) {
  if (status === 'on_time') return <Chip label="On time" tone="success" />;
  if (status === 'leave') return <Chip label="Leave" tone="info" />;
  return null;
}

function LocationRow({ label }: { label: string }) {
  return (
    <View style={styles.locRow}>
      <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
        <Path d="M12 21s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z" stroke={colors.textMuted} strokeWidth={1.8} />
        <Circle cx={12} cy={9} r={2.4} stroke={colors.textMuted} strokeWidth={1.8} />
      </Svg>
      <Text style={styles.locText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: colors.surface },
  topnav: { backgroundColor: colors.ink, paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  title: { fontFamily: fontFamily.display, fontSize: fontSize.lg, color: colors.white },
  subtitle: { color: '#9FB2AA', fontSize: 12.5, marginTop: 2 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl },
  hero: { alignItems: 'center', paddingTop: spacing.xl },
  ring: { width: 168, height: 168, borderRadius: 84, alignItems: 'center', justifyContent: 'center' },
  ringInner: { width: 128, height: 128, borderRadius: 64, alignItems: 'center', justifyContent: 'center' },
  ringLabel: { fontFamily: fontFamily.display, color: colors.white, fontSize: fontSize.md, marginTop: spacing.xs },
  ringSub: { fontSize: 10.5, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  timer: { fontSize: fontSize.base, color: colors.textMuted, marginTop: spacing.lg },
  timerBold: { fontFamily: fontFamily.display, color: colors.textPrimary },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  locText: { fontSize: 12.5, color: colors.textMuted },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  linkIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.infoTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.textPrimary },
  linkSub: { fontSize: 11.5, color: colors.textMuted, marginTop: 1 },
  sectionLabel: { fontSize: fontSize.base, fontWeight: '700', marginTop: spacing.xxl, marginBottom: spacing.sm },
  histItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md - 1,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  histDay: { fontSize: 13.5, fontWeight: '600', color: colors.textPrimary },
  histTime: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 1 },
});
