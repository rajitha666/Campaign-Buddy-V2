/**
 * Bottom tabs: Home | Sales | Attendance | Performance.
 *
 * This is the final nav structure after the redesign — Campaign products,
 * Time off, and Profile are intentionally NOT tabs; they're reached by
 * pushing from within Home/Attendance (see HomeStack / AttendanceStack).
 */
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Svg, { Path, Circle } from 'react-native-svg';
import type { MainTabParamList } from './types';
import { HomeStack } from './HomeStack';
import { AttendanceStack } from './AttendanceStack';
import { SalesSummaryScreen } from '@/screens/SalesSummaryScreen';
import { PerformanceScreen } from '@/screens/PerformanceScreen';
import { colors } from '@/theme';

const Tab = createBottomTabNavigator<MainTabParamList>();

function HomeIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 11l8-7 8 7v9a1 1 0 01-1 1h-4v-6H9v6H5a1 1 0 01-1-1z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </Svg>
  );
}
function SalesIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 12l4-2 4 5 6-10 4 3"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
function AttendanceIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8} stroke={color} strokeWidth={1.8} />
      <Path d="M12 8v4l3 2" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}
function PerformanceIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M5 20V12M12 20V4M19 20V9" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

export function MainTabs() {
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
        name="HomeTab"
        component={HomeStack}
        options={{ title: 'Home', tabBarIcon: ({ color }) => <HomeIcon color={color} /> }}
      />
      <Tab.Screen
        name="SalesTab"
        component={SalesSummaryScreen}
        options={{ title: 'Sales', tabBarIcon: ({ color }) => <SalesIcon color={color} /> }}
      />
      <Tab.Screen
        name="AttendanceTab"
        component={AttendanceStack}
        options={{ title: 'Attendance', tabBarIcon: ({ color }) => <AttendanceIcon color={color} /> }}
      />
      <Tab.Screen
        name="PerformanceTab"
        component={PerformanceScreen}
        options={{ title: 'Performance', tabBarIcon: ({ color }) => <PerformanceIcon color={color} /> }}
      />
    </Tab.Navigator>
  );
}
