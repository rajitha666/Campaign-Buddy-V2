/**
 * Supervisor mode's "My Route" tab — replaces Home/Sales/Attendance/Performance
 * for a `role: "campaign_owner"` login (see SupervisorTabs).
 *
 * Two sections, matching the backend's split (docs/api-spec.md §4):
 *  - "Today's visits" — real, check-in-able Activations (GET /me/assignments).
 *    A supervisor can have several outlets open the same day, unlike a
 *    promoter's single assignment, so each gets its own row.
 *  - "Planned route" — the SupervisorRoute itinerary (GET /me/supervisor-routes).
 *    Read-only by design: it's planning data only and never drives check-in
 *    eligibility (Backend Spec v3 §5.9) — don't add a check-in affordance here.
 */
import React from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as supervisorRouteApi from '@/api/supervisorRoute';
import * as attendanceApi from '@/api/attendance';
import { useAttendance } from '@/context/AttendanceContext';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { Button } from '@/components/Button';
import { colors, fontFamily, fontSize, spacing } from '@/theme';
import { getApiErrorMessage } from '@/api/client';
import { formatDay } from '@/lib/date';
import type { SupervisorAssignment } from '@/api/types';

const VISITS_KEY = ['supervisor', 'assignments', 'today'];

function useTodaysVisits() {
  return useQuery({
    queryKey: VISITS_KEY,
    queryFn: async () => {
      const assignments = await supervisorRouteApi.getMyAssignments();
      const withStatus = await Promise.all(
        assignments.map(async (a) => ({
          assignment: a,
          checkedIn: (await attendanceApi.getAttendanceToday(a.assignmentId)).checkedIn,
        }))
      );
      return withStatus;
    },
  });
}

export function SupervisorRouteScreen() {
  const visitsQuery = useTodaysVisits();
  const routesQuery = useQuery({ queryKey: ['supervisor', 'routes'], queryFn: supervisorRouteApi.getMyRoutes });

  return (
    <SafeAreaView style={styles.frame} edges={['top']}>
      <View style={styles.topnav}>
        <Text style={styles.title}>My Route</Text>
        <Text style={styles.subtitle}>Today's visits and your planned outlets</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>Today's visits</Text>
        {visitsQuery.isLoading ? (
          <Text style={styles.emptyText}>Loading…</Text>
        ) : (visitsQuery.data ?? []).length === 0 ? (
          <Text style={styles.emptyText}>No outlet visit scheduled for today.</Text>
        ) : (
          (visitsQuery.data ?? []).map((row) => <VisitRow key={row.assignment.assignmentId} row={row} />)
        )}

        <Text style={[styles.sectionLabel, { marginTop: spacing.xxl }]}>Planned route</Text>
        {routesQuery.isLoading ? (
          <Text style={styles.emptyText}>Loading…</Text>
        ) : (routesQuery.data ?? []).length === 0 ? (
          <Text style={styles.emptyText}>No route assigned yet.</Text>
        ) : (
          (routesQuery.data ?? []).map((route) => (
            <Card key={route.id} style={{ marginBottom: spacing.md }}>
              <Text style={styles.routeCampaign}>{route.campaign.name}</Text>
              <Text style={styles.routeDates}>
                {formatDay(route.dateFrom)} – {formatDay(route.dateTo)}
              </Text>
              {route.outlets.map((o) => (
                <Text key={o.id} style={styles.routeOutlet}>
                  • {o.name}
                </Text>
              ))}
            </Card>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function VisitRow({ row }: { row: { assignment: SupervisorAssignment; checkedIn: boolean } }) {
  const { assignment, checkedIn } = row;
  const { checkedIn: anyOpenElsewhere, checkIn, checkOut } = useAttendance();
  const queryClient = useQueryClient();
  const [busy, setBusy] = React.useState(false);

  async function handleCheckIn() {
    setBusy(true);
    try {
      await checkIn(assignment.assignmentId);
      queryClient.invalidateQueries({ queryKey: VISITS_KEY });
    } catch (err) {
      Alert.alert('Could not check in', getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleCheckOut() {
    setBusy(true);
    try {
      await checkOut();
      queryClient.invalidateQueries({ queryKey: VISITS_KEY });
    } catch (err) {
      Alert.alert('Could not check out', getApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // Global one-open-shift lock: another outlet is open, so this row can only wait.
  const disabled = !checkedIn && anyOpenElsewhere;

  return (
    <Card style={{ marginBottom: spacing.md }}>
      <View style={styles.visitHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.visitOutlet}>{assignment.outlet.name}</Text>
          <Text style={styles.visitCampaign}>{assignment.campaign.name}</Text>
        </View>
        {checkedIn ? <Chip label="Checked in" tone="success" /> : disabled ? <Chip label="Waiting" tone="pending" /> : null}
      </View>
      <Button
        label={checkedIn ? 'Check out' : 'Check in'}
        variant={checkedIn ? 'alert' : 'primary'}
        onPress={checkedIn ? handleCheckOut : handleCheckIn}
        disabled={disabled}
        loading={busy}
        style={{ marginTop: spacing.md }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: colors.surface },
  topnav: { backgroundColor: colors.ink, paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  title: { fontFamily: fontFamily.display, fontSize: fontSize.lg, color: colors.white },
  subtitle: { color: '#9FB2AA', fontSize: 12.5, marginTop: 2 },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xxxl },
  sectionLabel: { fontSize: fontSize.base, fontWeight: '700', marginBottom: spacing.md, color: colors.textPrimary },
  emptyText: { fontSize: fontSize.base, color: colors.textMuted },
  visitHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  visitOutlet: { fontFamily: fontFamily.display, fontSize: fontSize.md, color: colors.textPrimary },
  visitCampaign: { fontSize: 12.5, color: colors.textMuted, marginTop: 1 },
  routeCampaign: { fontFamily: fontFamily.display, fontSize: fontSize.md, color: colors.textPrimary },
  routeDates: { fontSize: 12.5, color: colors.textMuted, marginTop: 2, marginBottom: spacing.sm },
  routeOutlet: { fontSize: fontSize.base, color: colors.textPrimary, marginTop: 2 },
});
