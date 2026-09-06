/**
 * App entry point. Order matters here:
 *   1. Load fonts (Poppins) before rendering anything that uses them.
 *   2. QueryClientProvider wraps everything that calls useQuery/useMutation.
 *   3. AuthProvider wraps everything that needs to know who's signed in.
 *   4. RootNavigator decides Auth vs Main based on that.
 *
 * AttendanceProvider + location tracking are intentionally NOT here — see
 * navigation/AuthenticatedApp.tsx for why they're scoped to post-login only.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/context/AuthContext';
import { RootNavigator } from '@/navigation/RootNavigator';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000, // stats/attendance change often enough that a long stale time would show old numbers
    },
  },
});

export default function App() {
  const [fontsLoaded, setFontsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await Font.loadAsync({
          // TODO(dev): drop the actual .ttf files into ./assets/fonts and
          // point these paths at them — see README "Fonts" section.
          'Poppins-SemiBold': require('../assets/fonts/Poppins-SemiBold.ttf'),
          'Poppins-Bold': require('../assets/fonts/Poppins-Bold.ttf'),
        });
      } finally {
        setFontsLoaded(true);
      }
    })();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null; // splash screen stays up
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} onLayout={onLayoutRootView}>
      <StatusBar style="light" />
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </QueryClientProvider>
    </View>
  );
}
