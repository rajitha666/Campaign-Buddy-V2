/**
 * Everything inside here only exists once the user is signed in.
 * AttendanceContext calls GET /attendance/today on mount, which needs a
 * valid session — so it (and the location-tracking hook that depends on
 * it) must NOT be mounted above the login gate, or it'll fire a doomed,
 * unauthenticated request the moment the app opens.
 */
import React from 'react';
import { AttendanceProvider } from '@/context/AttendanceContext';
import { useAuth } from '@/context/AuthContext';
import { useLocationTracking } from '@/hooks/useLocationTracking';
import { MainTabs } from './MainTabs';
import { SupervisorTabs } from './SupervisorTabs';

function LocationTrackerMount() {
  useLocationTracking();
  return null;
}

export function AuthenticatedApp() {
  const { user } = useAuth();
  const isSupervisor = user?.role === 'campaign_owner';
  return (
    <AttendanceProvider>
      <LocationTrackerMount />
      {isSupervisor ? <SupervisorTabs /> : <MainTabs />}
    </AttendanceProvider>
  );
}
