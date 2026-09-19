/**
 * Everything inside here only exists once the user is signed in.
 * AttendanceContext calls GET /attendance/today on mount, which needs a
 * valid session — so it (and the location-tracking hook that depends on
 * it) must NOT be mounted above the login gate, or it'll fire a doomed,
 * unauthenticated request the moment the app opens.
 *
 * The offline layer (toast, connectivity, sync engine) lives here too: the
 * sync engine drains queued writes with the user's token, so it only makes
 * sense while signed in.
 */
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { registerBackgroundSync } from '@/offline/backgroundSync';
import { AttendanceProvider, useAttendance } from '@/context/AttendanceContext';
import { useAuth } from '@/context/AuthContext';
import { useLocationTracking } from '@/hooks/useLocationTracking';
import { useInactivityLogout } from '@/hooks/useInactivityLogout';
import { ToastProvider } from '@/components/Toast';
import { NetworkProvider, useNetwork } from '@/offline/NetworkContext';
import { SyncEngineProvider, useSyncEngine } from '@/offline/SyncContext';
import { MainTabs } from './MainTabs';
import { SupervisorTabs } from './SupervisorTabs';

function LocationTrackerMount() {
  useLocationTracking();
  return null;
}

function Shell() {
  const { user } = useAuth();
  const { checkedOutToday } = useAttendance();
  const { isOnline } = useNetwork();
  const { syncNow } = useSyncEngine();
  const isSupervisor = user?.role === 'campaign_owner';
  // A rep offline can't log back in (no offline password login), so until their
  // shift is over the inactivity sign-out is held off while there's no signal.
  const recordActivity = useInactivityLogout({ suspended: !isOnline && !checkedOutToday, beforeSignOut: syncNow });
  return (
    <View style={{ flex: 1 }} onTouchStart={recordActivity}>
      {isSupervisor ? <SupervisorTabs /> : <MainTabs />}
    </View>
  );
}

export function AuthenticatedApp() {
  useEffect(() => {
    registerBackgroundSync();
  }, []);
  return (
    <ToastProvider>
      <NetworkProvider>
        <SyncEngineProvider>
          <AttendanceProvider>
            <LocationTrackerMount />
            <Shell />
          </AttendanceProvider>
        </SyncEngineProvider>
      </NetworkProvider>
    </ToastProvider>
  );
}
