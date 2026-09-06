import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { AuthStack } from './AuthStack';
import { AuthenticatedApp } from './AuthenticatedApp';
import { colors } from '@/theme';

export function RootNavigator() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    // Restoring a persisted session on cold start (see AuthContext.tsx).
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink }}>
        <ActivityIndicator color={colors.mango} size="large" />
      </View>
    );
  }

  return <NavigationContainer>{user ? <AuthenticatedApp /> : <AuthStack />}</NavigationContainer>;
}
