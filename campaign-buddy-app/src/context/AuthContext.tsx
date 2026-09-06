/**
 * Holds the signed-in user and exposes login/logout. Persists tokens in
 * SecureStore (not AsyncStorage) since they're credentials, not app data.
 *
 * RootNavigator reads `user` from here to decide whether to show the
 * AuthStack (Login) or MainTabs — see navigation/RootNavigator.tsx.
 */
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getItem, setItem, deleteItem } from '@/api/secureStore';
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
        const token = await getItem(ACCESS_TOKEN_KEY);
        if (token) {
          const me = await profileApi.getMe();
          setUser(me);
        }
      } catch {
        // Token expired/invalid — fall through to the login screen.
        await deleteItem(ACCESS_TOKEN_KEY);
        await deleteItem(REFRESH_TOKEN_KEY);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const result = await authApi.login(username, password);
    await setItem(ACCESS_TOKEN_KEY, result.accessToken);
    await setItem(REFRESH_TOKEN_KEY, result.refreshToken);
    // The v3 backend's /auth/login returns only tokens, so pull the profile
    // separately (same call the cold-start path uses).
    setUser(result.user ?? (await profileApi.getMe()));
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Even if the network call fails, still clear local session below —
      // we don't want a dead network to trap the user signed in.
    }
    await deleteItem(ACCESS_TOKEN_KEY);
    await deleteItem(REFRESH_TOKEN_KEY);
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
