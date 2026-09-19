/**
 * My Route tab's internal stack: the route/visits list, and the outlet
 * checklist pushed from a checked-in visit (same pattern as HomeStack).
 */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { SupervisorRouteStackParamList } from './types';
import { SupervisorRouteScreen } from '@/screens/SupervisorRouteScreen';
import { SupervisorChecklistScreen } from '@/screens/SupervisorChecklistScreen';

const Stack = createNativeStackNavigator<SupervisorRouteStackParamList>();

export function SupervisorRouteStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SupervisorRoute" component={SupervisorRouteScreen} />
      <Stack.Screen name="SupervisorChecklist" component={SupervisorChecklistScreen} />
    </Stack.Navigator>
  );
}
