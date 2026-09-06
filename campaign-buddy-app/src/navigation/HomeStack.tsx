/**
 * Home tab's internal stack. Products, ProductUpdate, StatsUpdate, and
 * Profile are all reached by pushing from Home (not separate bottom tabs —
 * see the footer decision recorded in the product notes: only
 * Home / Sales / Attendance / Performance are tabs).
 */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { HomeStackParamList } from './types';
import { HomeScreen } from '@/screens/HomeScreen';
import { ProductsScreen } from '@/screens/ProductsScreen';
import { ProductUpdateScreen } from '@/screens/ProductUpdateScreen';
import { StatsUpdateScreen } from '@/screens/StatsUpdateScreen';
import { ProfileScreen } from '@/screens/ProfileScreen';

const Stack = createNativeStackNavigator<HomeStackParamList>();

export function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="Products" component={ProductsScreen} />
      <Stack.Screen name="ProductUpdate" component={ProductUpdateScreen} />
      <Stack.Screen name="StatsUpdate" component={StatsUpdateScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
    </Stack.Navigator>
  );
}
