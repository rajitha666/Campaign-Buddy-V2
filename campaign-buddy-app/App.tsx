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
import React, { useCallback } from 'react';
import { View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Poppins_600SemiBold, Poppins_700Bold } from '@expo-google-fonts/poppins';
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
  // Poppins ships as JS-bundled TTFs via @expo-google-fonts/poppins — no manual
  // asset files needed. Theme families are 'Poppins-SemiBold' / 'Poppins-Bold'
  // (see theme/typography.ts), aliased to the loaded weights here.
  const [loaded] = useFonts({
    'Poppins-SemiBold': Poppins_600SemiBold,
    'Poppins-Bold': Poppins_700Bold,
  });
  const fontsLoaded = loaded;

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
