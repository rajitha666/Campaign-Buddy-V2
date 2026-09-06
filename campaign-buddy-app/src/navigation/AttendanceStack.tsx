import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { AttendanceStackParamList } from './types';
import { AttendanceScreen } from '@/screens/AttendanceScreen';
import { TimeOffScreen } from '@/screens/TimeOffScreen';

const Stack = createNativeStackNavigator<AttendanceStackParamList>();

export function AttendanceStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Attendance" component={AttendanceScreen} />
      <Stack.Screen name="TimeOff" component={TimeOffScreen} />
    </Stack.Navigator>
  );
}
