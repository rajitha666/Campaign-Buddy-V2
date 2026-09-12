/**
 * Bottom tabs for a `role: "campaign_owner"` (supervisor) login: My Route | Profile.
 * Deliberately not Home/Sales/Attendance/Performance (see MainTabs.tsx) —
 * supervisors don't sell or log their own daily stock, they visit outlets on
 * a route and check in/out at each one from the My Route tab.
 */
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Svg, { Path, Circle } from 'react-native-svg';
import type { SupervisorTabParamList } from './types';
import { SupervisorRouteScreen } from '@/screens/SupervisorRouteScreen';
import { ProfileScreen } from '@/screens/ProfileScreen';
import { colors } from '@/theme';

const Tab = createBottomTabNavigator<SupervisorTabParamList>();

function RouteIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Circle cx={6} cy={6} r={2.4} stroke={color} strokeWidth={1.8} />
      <Circle cx={18} cy={18} r={2.4} stroke={color} strokeWidth={1.8} />
      <Path d="M8 7c3 0 2 8 5 8" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}
function ProfileIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8} r={3.4} stroke={color} strokeWidth={1.8} />
      <Path d="M5 20c1.5-4 4.2-6 7-6s5.5 2 7 6" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

export function SupervisorTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.mango,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { borderTopColor: colors.line, height: 76, paddingTop: 8, paddingBottom: 18 },
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="MyRouteTab"
        component={SupervisorRouteScreen}
        options={{ title: 'My Route', tabBarIcon: ({ color }) => <RouteIcon color={color} /> }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{ title: 'Profile', tabBarIcon: ({ color }) => <ProfileIcon color={color} /> }}
      />
    </Tab.Navigator>
  );
}
