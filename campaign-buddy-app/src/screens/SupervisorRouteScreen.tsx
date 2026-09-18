/**
 * Supervisor mode's "My Route" tab — replaces Home/Sales/Attendance/Performance
 * for a `role: "campaign_owner"` login (see SupervisorTabs).
 *
 * Two sections, matching the backend's split (docs/api-spec.md §4):
 *  - "Planned route" — the SupervisorRoute itinerary (GET /me/supervisor-routes).
 *    Pinned first on screen so the supervisor sees their itinerary immediately;
 *    read-only by design: it's planning data only and never drives check-in
 *    eligibility (Backend Spec v3 §5.9) — don't add a check-in affordance here.
 *  - "Today's visits" — real, check-in-able Activations (GET /me/assignments),
 *    sorted by the planned route's outlet order (display only).
 *    A supervisor can have several outlets open the same day, unlike a
 *    promoter's single assignment, so each gets its own row.
 */
import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SupervisorRouteStackParamList } from '@/navigation/types';
import * as supervisorRouteApi from '@/api/supervisorRoute';
import * as attendanceApi from '@/api/attendance';
import { useAttendance } from '@/context/AttendanceContext';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { Button } from '@/components/Button';
import { colors, fontFamily, fontSize, spacing } from '@/theme';
import { getApiErrorMessage, getApiErrorCode } from '@/api/client';
import { LocationUnavailableError } from '@/lib/checkInLocation';
import { showAlert } from '@/lib/showAlert';
import { formatDay } from '@/lib/date';
import { sortVisitsByRoute } from '@/lib/supervisorRouteOrder';
import { checklistUnlocked } from '@/lib/supervisorChecklist';
import type { SupervisorAssignment } from '@/api/types';

const VISITS_KEY = ['supervisor', 'assignments', 'today'];

function useTodaysVisits() {
  return useQuery({
    queryKey: VISITS_KEY,
    queryFn: async () => {
      const assignments = await supervisorRouteApi.getMyAssignments();
      const withStatus = await Promise.all(
        assignments.map(async (a) => {
          const today = await attendanceApi.getAttendanceToday(a.assignmentId);
          return { assignment: a, checkedIn: today.checkedIn, checkInAt: today.checkInAt };
        })
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
        <Text style={styles.sectionLabel}>Planned route</Text>
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

        <Text style={[styles.sectionLabel, { marginTop: spacing.xxl }]}>Today's visits</Text>
        {visitsQuery.isLoading ? (
          <Text style={styles.emptyText}>Loading…</Text>
        ) : (visitsQuery.data ?? []).length === 0 ? (
          <Text style={styles.emptyText}>No outlet visit scheduled for today.</Text>
        ) : (
          sortVisitsByRoute(visitsQuery.data ?? [], routesQuery.data ?? []).map((row) => (
            <VisitRow key={row.assignment.assignmentId} row={row} />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function VisitRow({ row }: { row: { assignment: SupervisorAssignment; checkedIn: boolean; checkInAt: string | null } }) {
  const { assignment, checkedIn } = row;
  const checklistOpen = checklistUnlocked(row);
  const { checkedIn: anyOpenElsewhere, checkIn, checkOut } = useAttendance();
  const navigation = useNavigation<NativeStackNavigationProp<SupervisorRouteStackParamList, 'SupervisorRoute'>>();
  const queryClient = useQueryClient();
  const [busy, setBusy] = React.useState(false);
  const [inactive, setInactive] = React.useState(false);

  async function handleCheckIn() {
    setBusy(true);
    try {
      await checkIn(assignment.assignmentId);
      queryClient.invalidateQueries({ queryKey: VISITS_KEY });
      // Land straight on the checked-in outlet's checklist.
      navigation.navigate('SupervisorChecklist', {
        assignmentId: assignment.assignmentId,
        outletName: assignment.outlet.name,
        campaignName: assignment.campaign.name,
      });
    } catch (err) {
      if (err instanceof LocationUnavailableError) {
        showAlert('Location required', err.message);
      } else if (getApiErrorCode(err) === 'NOT_FOUND') {
        // NOT_FOUND means the outlet's activation isn't active today (e.g.
        // the row was loaded before midnight and its visit date passed).
        // Show it as "Not active" instead of interrupting with an alert.
        setInactive(true);
      } else {
        showAlert('Could not check in', getApiErrorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleCheckOut() {
    setBusy(true);
    try {
      await checkOut(assignment.assignmentId);
      queryClient.invalidateQueries({ queryKey: VISITS_KEY });
    } catch (err) {
      if (getApiErrorCode(err) === 'NOT_FOUND') {
        setInactive(true);
      } else {
        showAlert('Could not check out', getApiErrorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  // Global one-open-shift lock: another outlet is open, so this row can only wait.
  const disabled = inactive || (!checkedIn && anyOpenElsewhere);

  return (
    <Card style={{ marginBottom: spacing.md, opacity: inactive ? 0.65 : 1 }}>
      <View style={styles.visitHead}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.visitOutlet, inactive ? styles.inactiveText : null]}>{assignment.outlet.name}</Text>
          <Text style={styles.visitCampaign}>{assignment.campaign.name}</Text>
        </View>
        {checkedIn ? (
          <Chip label="Checked in" tone="success" />
        ) : inactive ? (
          <Chip label="Not active" tone="pending" />
        ) : disabled ? (
          <Chip label="Waiting" tone="pending" />
        ) : null}
      </View>
      <Button
        label={checkedIn ? 'Check out' : 'Check in'}
        variant={checkedIn ? 'alert' : 'primary'}
        onPress={checkedIn ? handleCheckOut : handleCheckIn}
        disabled={disabled}
        loading={busy}
        style={{ marginTop: spacing.md }}
      />
      <Button
        label="Outlet checklist"
        variant="secondary"
        onPress={() =>
          navigation.navigate('SupervisorChecklist', {
            assignmentId: assignment.assignmentId,
            outletName: assignment.outlet.name,
            campaignName: assignment.campaign.name,
          })
        }
        disabled={!checklistOpen}
        style={{ marginTop: spacing.sm }}
      />
      {!checklistOpen && !inactive ? <Text style={styles.checklistHint}>Check in to fill this outlet's checklist.</Text> : null}
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
  inactiveText: { color: colors.textMuted },
  visitOutlet: { fontFamily: fontFamily.display, fontSize: fontSize.md, color: colors.textPrimary },
  visitCampaign: { fontSize: 12.5, color: colors.textMuted, marginTop: 1 },
  checklistHint: { fontSize: 12, color: colors.textMuted, marginTop: spacing.xs },
  routeCampaign: { fontFamily: fontFamily.display, fontSize: fontSize.md, color: colors.textPrimary },
  routeDates: { fontSize: 12.5, color: colors.textMuted, marginTop: 2, marginBottom: spacing.sm },
  routeOutlet: { fontSize: fontSize.base, color: colors.textPrimary, marginTop: 2 },
});
