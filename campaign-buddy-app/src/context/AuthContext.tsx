/**
 * Holds the signed-in user and exposes login/logout. Persists tokens in
 * SecureStore (not AsyncStorage) since they're credentials, not app data.
 *
 * RootNavigator reads `user` from here to decide whether to show the
 * AuthStack (Login) or MainTabs — see navigation/RootNavigator.tsx.
 */
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from '@/api/client';
import * as authApi from '@/api/auth';
import * as profileApi from '@/api/profile';
import type { User } from '@/api/types';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean; // true while restoring a session on cold start
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On cold start: if a token is already stored, try to fetch the profile
  // to confirm it's still valid rather than trusting it blindly.
  useEffect(() => {
    (async () => {
      try {
        const token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
        if (token) {
          const me = await profileApi.getMe();
          setUser(me);
        }
      } catch {
        // Token expired/invalid — fall through to the login screen.
        await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
        await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const result = await authApi.login(username, password);
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, result.accessToken);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, result.refreshToken);
    setUser(result.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Even if the network call fails, still clear local session below —
      // we don't want a dead network to trap the user signed in.
    }
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
